package main

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"time"

	"github.com/gin-gonic/gin"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// EventService: sumber data untuk Fitur 2 (Node Status & Failover Visibility)
// bagian "workload otomatis berpindah (evicted/rescheduled) ke node sehat" —
// diambil dari Event asli Kubernetes (NodeNotReady, TaintManagerEviction,
// Killing, Scheduled, dll), bukan disimulasikan.
type EventService struct {
	clientset *kubernetes.Clientset
}

func NewEventService(clientset *kubernetes.Clientset) *EventService {
	return &EventService{clientset: clientset}
}

func (s *EventService) RegisterRoutes(r *gin.Engine) {
	r.GET("/api/v1/events", s.handleList)
}

var relevantEventReasons = map[string]bool{
	"NodeNotReady":         true,
	"NodeReady":            true,
	"NodeNotSchedulable":   true,
	"NodeSchedulable":      true,
	"Killing":              true,
	"Preempted":            true,
	"Evicted":              true,
	"TaintManagerEviction": true,
	"FailedScheduling":     true,
	"Scheduled":            true,
}

type simpleEvent struct {
	eventType string
	reason    string
	message   string
	object    string
	nodeName  string
	timestamp time.Time
}

func (s *EventService) handleList(c *gin.Context) {
	requestContext, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	eventsList, err := s.clientset.CoreV1().Events("").List(requestContext, metav1.ListOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var filtered []simpleEvent
	for _, ev := range eventsList.Items {
		if !relevantEventReasons[ev.Reason] {
			continue
		}

		ts := ev.LastTimestamp.Time
		if ts.IsZero() {
			ts = ev.EventTime.Time
		}

		nodeName := ""
		if ev.InvolvedObject.Kind == "Node" {
			nodeName = ev.InvolvedObject.Name
		} else if ev.Source.Host != "" {
			nodeName = ev.Source.Host
		}

		filtered = append(filtered, simpleEvent{
			eventType: ev.Type,
			reason:    ev.Reason,
			message:   ev.Message,
			object:    fmt.Sprintf("%s/%s", ev.InvolvedObject.Kind, ev.InvolvedObject.Name),
			nodeName:  nodeName,
			timestamp: ts,
		})
	}

	sort.Slice(filtered, func(i, j int) bool {
		return filtered[i].timestamp.After(filtered[j].timestamp)
	})

	if len(filtered) > 50 {
		filtered = filtered[:50]
	}

	eventList := make([]map[string]interface{}, 0, len(filtered))
	for _, ev := range filtered {
		eventList = append(eventList, map[string]interface{}{
			"type":    ev.eventType,
			"reason":  ev.reason,
			"message": ev.message,
			"object":  ev.object,
			"node":    ev.nodeName,
			"time":    ev.timestamp,
		})
	}

	c.JSON(http.StatusOK, gin.H{"data": eventList})
}
