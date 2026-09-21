package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
	"k8s.io/client-go/kubernetes"
)

// DeploymentService: Fitur 5 (jumlah replica), Fitur 11 (Zero-CLI Deployment),
// dan aksi App Services (start/stop/scale/restart lewat scale+rollout restart).
type DeploymentService struct {
	clientset *kubernetes.Clientset
}

func NewDeploymentService(clientset *kubernetes.Clientset) *DeploymentService {
	return &DeploymentService{clientset: clientset}
}

func (s *DeploymentService) RegisterRoutes(r *gin.Engine) {
	r.GET("/api/v1/deployments", s.handleList)
	r.POST("/api/v1/apps/deploy", s.handleDeploy)
	r.PATCH("/api/v1/deployments/:namespace/:name/scale", s.handleScale)
	r.POST("/api/v1/deployments/:namespace/:name/restart", s.handleRestart)
}

// handleList: sumber "jumlah replica" untuk Fitur 5 (Deployment & Pod Lifecycle).
func (s *DeploymentService) handleList(c *gin.Context) {
	requestContext, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	namespace := c.Query("namespace")
	if namespace == "all" || namespace == "All" {
		namespace = ""
	}

	deployments, err := s.clientset.AppsV1().Deployments(namespace).List(requestContext, metav1.ListOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	deployList := make([]map[string]interface{}, 0, len(deployments.Items))
	for _, d := range deployments.Items {
		desired := int32(1)
		if d.Spec.Replicas != nil {
			desired = *d.Spec.Replicas
		}

		image := ""
		if len(d.Spec.Template.Spec.Containers) > 0 {
			image = d.Spec.Template.Spec.Containers[0].Image
		}

		deployList = append(deployList, map[string]interface{}{
			"name":              d.Name,
			"namespace":         d.Namespace,
			"desiredReplicas":   desired,
			"readyReplicas":     d.Status.ReadyReplicas,
			"availableReplicas": d.Status.AvailableReplicas,
			"updatedReplicas":   d.Status.UpdatedReplicas,
			"image":             image,
			"createdAt":         d.CreationTimestamp.Time,
		})
	}

	c.JSON(http.StatusOK, gin.H{"data": deployList})
}

// handleDeploy: Fitur 11 (Zero-CLI Deployment & App Management). Bikin
// Deployment + Service sungguhan dari form sederhana — pengganti
// `kubectl apply`/`docker run`, bukan sekadar respons sukses palsu.
func (s *DeploymentService) handleDeploy(c *gin.Context) {
	var body struct {
		AppName   string `json:"appName"`
		Namespace string `json:"namespace"`
		Image     string `json:"image"`
		Port      string `json:"port"`
		Replicas  int    `json:"replicas"`
		CPULimit  string `json:"cpuLimit"`
		RAMLimit  string `json:"ramLimit"`
		EnvVars   []struct {
			Key   string `json:"key"`
			Value string `json:"value"`
		} `json:"envVars"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Payload tidak valid: " + err.Error()})
		return
	}
	if body.AppName == "" || body.Namespace == "" || body.Image == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "appName, namespace, dan image wajib diisi"})
		return
	}

	portNum, portErr := strconv.ParseInt(body.Port, 10, 32)
	if portErr != nil || portNum <= 0 || portNum > 65535 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Port tidak valid"})
		return
	}

	replicas := int32(body.Replicas)
	if replicas <= 0 {
		replicas = 1
	}

	cpuQty, cpuErr := resource.ParseQuantity(body.CPULimit)
	if cpuErr != nil {
		cpuQty = resource.MustParse("500m")
	}
	memQty, memErr := resource.ParseQuantity(body.RAMLimit)
	if memErr != nil {
		memQty = resource.MustParse("512Mi")
	}

	var envList []corev1.EnvVar
	for _, e := range body.EnvVars {
		if e.Key == "" {
			continue
		}
		envList = append(envList, corev1.EnvVar{Name: e.Key, Value: e.Value})
	}

	requestContext, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	labels := map[string]string{"app": body.AppName, "managed-by": "monitoring-dashboard"}

	deployment := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: body.AppName, Labels: labels},
		Spec: appsv1.DeploymentSpec{
			Replicas: &replicas,
			Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": body.AppName}},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: map[string]string{"app": body.AppName}},
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{
						{
							Name:  body.AppName,
							Image: body.Image,
							Ports: []corev1.ContainerPort{{ContainerPort: int32(portNum)}},
							Env:   envList,
							Resources: corev1.ResourceRequirements{
								Limits: corev1.ResourceList{
									corev1.ResourceCPU:    cpuQty,
									corev1.ResourceMemory: memQty,
								},
								// Requests disamakan dengan Limits (QoS Guaranteed) — penting
								// karena kalau namespace-nya punya ResourceQuota (Fitur 4),
								// pod TANPA request eksplisit akan ditolak API server.
								Requests: corev1.ResourceList{
									corev1.ResourceCPU:    cpuQty,
									corev1.ResourceMemory: memQty,
								},
							},
						},
					},
				},
			},
		},
	}

	createdDeployment, deployErr := s.clientset.AppsV1().Deployments(body.Namespace).Create(requestContext, deployment, metav1.CreateOptions{})
	if deployErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat Deployment: " + deployErr.Error()})
		return
	}

	svc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{Name: body.AppName, Labels: labels},
		Spec: corev1.ServiceSpec{
			Selector: map[string]string{"app": body.AppName},
			Ports: []corev1.ServicePort{
				{Port: int32(portNum), TargetPort: intstr.FromInt(int(portNum))},
			},
		},
	}
	serviceCreated := true
	if _, svcErr := s.clientset.CoreV1().Services(body.Namespace).Create(requestContext, svc, metav1.CreateOptions{}); svcErr != nil {
		log.Printf("Gagal membuat Service untuk app %s di namespace %s: %v", body.AppName, body.Namespace, svcErr)
		serviceCreated = false
	}

	c.JSON(http.StatusCreated, gin.H{
		"message":        fmt.Sprintf("Deployment %s berhasil dibuat di namespace %s", body.AppName, body.Namespace),
		"deploymentName": createdDeployment.Name,
		"serviceCreated": serviceCreated,
	})
}

// handleScale: sumber aksi untuk App Services (Start/Stop/slider scaling).
// Start = scale ke replicas>0, Stop = scale ke 0 — keduanya lewat endpoint yang sama.
func (s *DeploymentService) handleScale(c *gin.Context) {
	namespace := c.Param("namespace")
	name := c.Param("name")

	var body struct {
		Replicas int32 `json:"replicas"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Replicas < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Jumlah replicas tidak valid"})
		return
	}

	requestContext, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	deployment, err := s.clientset.AppsV1().Deployments(namespace).Get(requestContext, name, metav1.GetOptions{})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	deployment.Spec.Replicas = &body.Replicas
	if _, err := s.clientset.AppsV1().Deployments(namespace).Update(requestContext, deployment, metav1.UpdateOptions{}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Deployment di-scale", "replicas": body.Replicas})
}

// handleRestart: setara `kubectl rollout restart` — patch annotation template
// pod supaya controller melakukan rolling restart semua pod-nya.
func (s *DeploymentService) handleRestart(c *gin.Context) {
	namespace := c.Param("namespace")
	name := c.Param("name")

	requestContext, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	deployment, err := s.clientset.AppsV1().Deployments(namespace).Get(requestContext, name, metav1.GetOptions{})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	if deployment.Spec.Template.ObjectMeta.Annotations == nil {
		deployment.Spec.Template.ObjectMeta.Annotations = map[string]string{}
	}
	deployment.Spec.Template.ObjectMeta.Annotations["kubectl.kubernetes.io/restartedAt"] = time.Now().Format(time.RFC3339)

	if _, err := s.clientset.AppsV1().Deployments(namespace).Update(requestContext, deployment, metav1.UpdateOptions{}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Rolling restart dipicu"})
}
