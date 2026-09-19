package main

import (
	"context"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// firstMilli/firstValue mencari key pertama yang ada di ResourceList (mis. Status.Hard
// sebuah ResourceQuota) dari beberapa kemungkinan penamaan resource (requests.cpu vs
// limits.cpu vs cpu), karena cluster berbeda bisa memakai konvensi ResourceQuota berbeda.
func firstMilli(list corev1.ResourceList, keys ...corev1.ResourceName) (int64, bool) {
	for _, k := range keys {
		if q, ok := list[k]; ok {
			return q.MilliValue(), true
		}
	}
	return 0, false
}

func firstValue(list corev1.ResourceList, keys ...corev1.ResourceName) (int64, bool) {
	for _, k := range keys {
		if q, ok := list[k]; ok {
			return q.Value(), true
		}
	}
	return 0, false
}

type quotaResourceSpec struct {
	label    string
	hardKeys []corev1.ResourceName
	useMilli bool
}

var quotaResourceSpecs = []quotaResourceSpec{
	{"cpu", []corev1.ResourceName{corev1.ResourceRequestsCPU, corev1.ResourceLimitsCPU, corev1.ResourceCPU}, true},
	{"memory", []corev1.ResourceName{corev1.ResourceRequestsMemory, corev1.ResourceLimitsMemory, corev1.ResourceMemory}, false},
	{"storage", []corev1.ResourceName{corev1.ResourceRequestsStorage}, false},
	{"pods", []corev1.ResourceName{corev1.ResourcePods}, false},
}

// NamespaceService: Fitur 3 (Project/Namespace Grouping) & Fitur 4 (Quota & Limit
// Monitoring). "project baru = namespace baru" — list/create/delete di sini
// langsung memanggil Kubernetes API, bukan state lokal di frontend. Setiap
// namespace baru langsung dibekali template-tenant: ResourceQuota, LimitRange,
// NetworkPolicy isolasi, dan RBAC scoped.
type NamespaceService struct {
	clientset *kubernetes.Clientset
	cfg       *Config
}

func NewNamespaceService(clientset *kubernetes.Clientset, cfg *Config) *NamespaceService {
	return &NamespaceService{clientset: clientset, cfg: cfg}
}

func (s *NamespaceService) RegisterRoutes(r *gin.Engine) {
	r.GET("/api/v1/namespaces", s.handleList)
	r.POST("/api/v1/namespaces", s.handleCreate)
	r.DELETE("/api/v1/namespaces/:name", s.handleDelete)
	r.GET("/api/v1/namespaces/:name/quota", s.handleGetQuota)
}

func (s *NamespaceService) handleList(c *gin.Context) {
	requestContext, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	nsList, err := s.clientset.CoreV1().Namespaces().List(requestContext, metav1.ListOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	podCountByNamespace := map[string]int{}
	if podsList, podsErr := s.clientset.CoreV1().Pods("").List(requestContext, metav1.ListOptions{}); podsErr == nil {
		for _, pod := range podsList.Items {
			podCountByNamespace[pod.Namespace]++
		}
	}

	nsData := make([]map[string]interface{}, 0, len(nsList.Items))
	for _, ns := range nsList.Items {
		nsData = append(nsData, map[string]interface{}{
			"name":        ns.Name,
			"status":      string(ns.Status.Phase),
			"description": ns.Annotations["dashboard.description"],
			"podCount":    podCountByNamespace[ns.Name],
			"createdAt":   ns.CreationTimestamp.Time,
		})
	}

	c.JSON(http.StatusOK, gin.H{"data": nsData})
}

func (s *NamespaceService) handleCreate(c *gin.Context) {
	var body struct {
		Name          string `json:"name"`
		Description   string `json:"description"`
		CPURequest    string `json:"cpuRequest"`
		CPULimit      string `json:"cpuLimit"`
		MemoryRequest string `json:"memoryRequest"`
		MemoryLimit   string `json:"memoryLimit"`
		PodsQuota     string `json:"podsQuota"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Nama namespace wajib diisi"})
		return
	}
	if body.CPURequest == "" {
		body.CPURequest = "2.0"
	}
	if body.CPULimit == "" {
		body.CPULimit = "4.0"
	}
	if body.MemoryRequest == "" {
		body.MemoryRequest = "4.0"
	}
	if body.MemoryLimit == "" {
		body.MemoryLimit = "8.0"
	}
	if body.PodsQuota == "" {
		body.PodsQuota = "10"
	}

	requestContext, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	ns := &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{
			Name: body.Name,
			Annotations: map[string]string{
				"dashboard.description": body.Description,
			},
		},
	}

	created, err := s.clientset.CoreV1().Namespaces().Create(requestContext, ns, metav1.CreateOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	quotaApplied := s.applyQuotaTemplate(requestContext, body.Name, body.CPURequest, body.CPULimit, body.MemoryRequest, body.MemoryLimit, body.PodsQuota)
	networkPolicyApplied := s.applyNetworkIsolation(requestContext, body.Name)
	rbacApplied := s.applyRBACTemplate(requestContext, body.Name)

	c.JSON(http.StatusCreated, gin.H{
		"name":                 created.Name,
		"status":               string(created.Status.Phase),
		"quotaApplied":         quotaApplied,
		"networkPolicyApplied": networkPolicyApplied,
		"rbacApplied":          rbacApplied,
	})
}

// applyQuotaTemplate: bagian "template-tenant" — ResourceQuota (batas agregat
// CPU/RAM/pods sesuai pilihan form) + LimitRange (default request/limit per
// container). LimitRange penting karena begitu ResourceQuota dengan
// requests.cpu/requests.memory aktif, semua pod baru WAJIB mencantumkan
// resource request eksplisit atau ditolak API server. Penamaan mengikuti
// template yang sudah dipakai manual di namespace spending-mgmt
// (quota-<ns>, limit-<ns>, dst).
func (s *NamespaceService) applyQuotaTemplate(ctx context.Context, name, cpuRequest, cpuLimit, memoryRequest, memoryLimit, podsQuota string) bool {
	cpuRequestQty, cpuReqErr := resource.ParseQuantity(cpuRequest)
	cpuLimitQty, cpuLimErr := resource.ParseQuantity(cpuLimit)
	memRequestQty, memReqErr := resource.ParseQuantity(memoryRequest + "Gi")
	memLimitQty, memLimErr := resource.ParseQuantity(memoryLimit + "Gi")
	podsQty, podsErr := resource.ParseQuantity(podsQuota)
	if cpuReqErr != nil || cpuLimErr != nil || memReqErr != nil || memLimErr != nil || podsErr != nil {
		log.Printf("Nilai quota tidak valid untuk namespace %s: cpuReq=%v cpuLim=%v memReq=%v memLim=%v pods=%v", name, cpuReqErr, cpuLimErr, memReqErr, memLimErr, podsErr)
		return false
	}

	applied := true
	rq := &corev1.ResourceQuota{
		ObjectMeta: metav1.ObjectMeta{Name: "quota-" + name},
		Spec: corev1.ResourceQuotaSpec{
			Hard: corev1.ResourceList{
				corev1.ResourceRequestsCPU:    cpuRequestQty,
				corev1.ResourceLimitsCPU:      cpuLimitQty,
				corev1.ResourceRequestsMemory: memRequestQty,
				corev1.ResourceLimitsMemory:   memLimitQty,
				corev1.ResourcePods:           podsQty,
			},
		},
	}
	if _, rqErr := s.clientset.CoreV1().ResourceQuotas(name).Create(ctx, rq, metav1.CreateOptions{}); rqErr != nil {
		log.Printf("Gagal membuat ResourceQuota default untuk namespace %s: %v", name, rqErr)
		applied = false
	}

	lr := &corev1.LimitRange{
		ObjectMeta: metav1.ObjectMeta{Name: "limit-" + name},
		Spec: corev1.LimitRangeSpec{
			Limits: []corev1.LimitRangeItem{
				{
					Type: corev1.LimitTypeContainer,
					Default: corev1.ResourceList{
						corev1.ResourceCPU:    resource.MustParse("250m"),
						corev1.ResourceMemory: resource.MustParse("256Mi"),
					},
					DefaultRequest: corev1.ResourceList{
						corev1.ResourceCPU:    resource.MustParse("100m"),
						corev1.ResourceMemory: resource.MustParse("128Mi"),
					},
				},
			},
		},
	}
	if _, lrErr := s.clientset.CoreV1().LimitRanges(name).Create(ctx, lr, metav1.CreateOptions{}); lrErr != nil {
		log.Printf("Gagal membuat LimitRange default untuk namespace %s: %v", name, lrErr)
		applied = false
	}

	return applied
}

// applyNetworkIsolation: pod di namespace tenant hanya bisa diakses dari pod
// lain di namespace yang sama atau dari ingress controller, tidak dari
// namespace tenant lain. Hanya membatasi Ingress — egress tetap bebas (DNS,
// API eksternal, dll tetap jalan seperti biasa).
//
// PENTING: peer "same-namespace" SENGAJA ditulis eksplisit lewat
// namespaceSelector (bukan podSelector:{} kosong tanpa namespaceSelector,
// walau secara spec K8s keduanya seharusnya setara/"scoped ke namespace
// sendiri"). Terbukti lewat pengujian manual bahwa kube-router (network
// policy controller bawaan k3s di cluster ini) SALAH menerapkan bentuk
// podSelector:{} kosong — trafik same-namespace yang seharusnya diizinkan
// malah ikut ditolak. Bentuk namespaceSelector eksplisit di bawah ini
// terbukti bekerja benar.
func (s *NamespaceService) applyNetworkIsolation(ctx context.Context, name string) bool {
	netpol := &networkingv1.NetworkPolicy{
		ObjectMeta: metav1.ObjectMeta{Name: "isolate-" + name},
		Spec: networkingv1.NetworkPolicySpec{
			PodSelector: metav1.LabelSelector{},
			PolicyTypes: []networkingv1.PolicyType{networkingv1.PolicyTypeIngress},
			Ingress: []networkingv1.NetworkPolicyIngressRule{
				{
					From: []networkingv1.NetworkPolicyPeer{
						{NamespaceSelector: &metav1.LabelSelector{
							MatchLabels: map[string]string{"kubernetes.io/metadata.name": name},
						}},
						{NamespaceSelector: &metav1.LabelSelector{
							MatchLabels: map[string]string{"kubernetes.io/metadata.name": s.cfg.IngressControllerNamespace()},
						}},
					},
				},
			},
		},
	}
	if _, npErr := s.clientset.NetworkingV1().NetworkPolicies(name).Create(ctx, netpol, metav1.CreateOptions{}); npErr != nil {
		log.Printf("Gagal membuat NetworkPolicy isolasi untuk namespace %s: %v", name, npErr)
		return false
	}
	return true
}

// applyRBACTemplate: mengikuti pola yang sudah dipakai manual di namespace
// spending-mgmt — Role kustom "<namespace>-admin-role" (bukan ClusterRole
// bawaan), ServiceAccount "dev-<namespace>", diikat lewat RoleBinding
// "bind-<namespace>-admin". RoleBinding membuat hak aksesnya berlaku HANYA
// di namespace ini, tidak bisa menyentuh namespace lain. Belum tersambung
// ke sistem login dashboard (masih dummy auth), ini fondasi identitas
// per-tenant untuk nanti.
func (s *NamespaceService) applyRBACTemplate(ctx context.Context, name string) bool {
	applied := true
	roleName := name + "-admin-role"
	role := &rbacv1.Role{
		ObjectMeta: metav1.ObjectMeta{Name: roleName},
		Rules: []rbacv1.PolicyRule{
			{
				APIGroups: []string{""},
				Resources: []string{"pods", "pods/log", "pods/exec", "services", "configmaps", "secrets", "persistentvolumeclaims", "events"},
				Verbs:     []string{"get", "list", "watch", "create", "update", "patch", "delete"},
			},
			{
				APIGroups: []string{"apps"},
				Resources: []string{"deployments", "replicasets", "statefulsets", "daemonsets"},
				Verbs:     []string{"get", "list", "watch", "create", "update", "patch", "delete"},
			},
			{
				APIGroups: []string{"batch"},
				Resources: []string{"jobs", "cronjobs"},
				Verbs:     []string{"get", "list", "watch", "create", "update", "patch", "delete"},
			},
		},
	}
	if _, roleErr := s.clientset.RbacV1().Roles(name).Create(ctx, role, metav1.CreateOptions{}); roleErr != nil {
		log.Printf("Gagal membuat Role %s untuk namespace %s: %v", roleName, name, roleErr)
		applied = false
	}

	saName := "dev-" + name
	sa := &corev1.ServiceAccount{ObjectMeta: metav1.ObjectMeta{Name: saName}}
	if _, saErr := s.clientset.CoreV1().ServiceAccounts(name).Create(ctx, sa, metav1.CreateOptions{}); saErr != nil {
		log.Printf("Gagal membuat ServiceAccount %s untuk namespace %s: %v", saName, name, saErr)
		return false
	}

	rb := &rbacv1.RoleBinding{
		ObjectMeta: metav1.ObjectMeta{Name: "bind-" + name + "-admin"},
		RoleRef: rbacv1.RoleRef{
			APIGroup: "rbac.authorization.k8s.io",
			Kind:     "Role",
			Name:     roleName,
		},
		Subjects: []rbacv1.Subject{
			{Kind: "ServiceAccount", Name: saName, Namespace: name},
		},
	}
	if _, rbErr := s.clientset.RbacV1().RoleBindings(name).Create(ctx, rb, metav1.CreateOptions{}); rbErr != nil {
		log.Printf("Gagal membuat RoleBinding bind-%s-admin untuk namespace %s: %v", name, name, rbErr)
		applied = false
	}

	return applied
}

func (s *NamespaceService) handleDelete(c *gin.Context) {
	name := c.Param("name")

	requestContext, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if err := s.clientset.CoreV1().Namespaces().Delete(requestContext, name, metav1.DeleteOptions{}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "namespace deleted", "name": name})
}

// handleGetQuota: sumber data untuk Fitur 4 (Quota & Limit Monitoring). Pakai
// ResourceQuota asli kalau namespace punya satu (untuk batas/"hard"), dan
// selalu hitung actual usage real dari request container pod + PVC di
// namespace itu (bukan angka rekaan), supaya tetap informatif meski
// namespace belum diberi ResourceQuota sama sekali.
func (s *NamespaceService) handleGetQuota(c *gin.Context) {
	name := c.Param("name")
	requestContext, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	rqList, rqErr := s.clientset.CoreV1().ResourceQuotas(name).List(requestContext, metav1.ListOptions{})
	if rqErr != nil {
		log.Printf("Gagal mengambil ResourceQuota di namespace %s: %v", name, rqErr)
	}
	hasResourceQuota := rqErr == nil && len(rqList.Items) > 0

	hard := map[string]int64{}
	hasHard := map[string]bool{}
	if hasResourceQuota {
		for _, rq := range rqList.Items {
			for _, spec := range quotaResourceSpecs {
				if hasHard[spec.label] {
					continue
				}
				var v int64
				var ok bool
				if spec.useMilli {
					v, ok = firstMilli(rq.Status.Hard, spec.hardKeys...)
				} else {
					v, ok = firstValue(rq.Status.Hard, spec.hardKeys...)
				}
				if ok {
					hard[spec.label] = v
					hasHard[spec.label] = true
				}
			}
		}
	}

	var actualPodCount int
	var actualCPURequestMilli, actualMemoryRequestBytes int64
	podsList, podsErr := s.clientset.CoreV1().Pods(name).List(requestContext, metav1.ListOptions{})
	if podsErr != nil {
		log.Printf("Gagal mengambil Pods di namespace %s: %v", name, podsErr)
	} else {
		actualPodCount = len(podsList.Items)
		for _, pod := range podsList.Items {
			for _, container := range pod.Spec.Containers {
				if q, ok := container.Resources.Requests[corev1.ResourceCPU]; ok {
					actualCPURequestMilli += q.MilliValue()
				}
				if q, ok := container.Resources.Requests[corev1.ResourceMemory]; ok {
					actualMemoryRequestBytes += q.Value()
				}
			}
		}
	}

	var actualStorageBytes int64
	pvcList, pvcErr := s.clientset.CoreV1().PersistentVolumeClaims(name).List(requestContext, metav1.ListOptions{})
	if pvcErr != nil {
		log.Printf("Gagal mengambil PersistentVolumeClaims di namespace %s: %v", name, pvcErr)
	} else {
		for _, pvc := range pvcList.Items {
			if q, ok := pvc.Spec.Resources.Requests[corev1.ResourceStorage]; ok {
				actualStorageBytes += q.Value()
			}
		}
	}

	percent := func(used, hardVal int64, has bool) float64 {
		if !has || hardVal <= 0 {
			return 0
		}
		return float64(used) / float64(hardVal) * 100
	}

	c.JSON(http.StatusOK, gin.H{
		"namespace":        name,
		"hasResourceQuota": hasResourceQuota,
		"cpu": gin.H{
			"usedMilli": actualCPURequestMilli,
			"hardMilli": hard["cpu"],
			"hasHard":   hasHard["cpu"],
			"percent":   percent(actualCPURequestMilli, hard["cpu"], hasHard["cpu"]),
		},
		"memory": gin.H{
			"usedBytes": actualMemoryRequestBytes,
			"hardBytes": hard["memory"],
			"hasHard":   hasHard["memory"],
			"percent":   percent(actualMemoryRequestBytes, hard["memory"], hasHard["memory"]),
		},
		"storage": gin.H{
			"usedBytes": actualStorageBytes,
			"hardBytes": hard["storage"],
			"hasHard":   hasHard["storage"],
			"percent":   percent(actualStorageBytes, hard["storage"], hasHard["storage"]),
		},
		"pods": gin.H{
			"used":    actualPodCount,
			"hard":    hard["pods"],
			"hasHard": hasHard["pods"],
			"percent": percent(int64(actualPodCount), hard["pods"], hasHard["pods"]),
		},
	})
}
