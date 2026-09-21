package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// AuthService: login dashboard. BELUM ADA validasi kredensial sungguhan —
// username/password apapun diterima. Ini stub yang disengaja (bukan bug
// tersembunyi): ditandai jelas di UI login ("Development Mode — No Auth
// Validation") supaya tidak disangka aman. Kalau nanti perlu auth sungguhan,
// method Login() di sini yang perlu diganti untuk cek ke database/LDAP.
type AuthService struct{}

func NewAuthService() *AuthService {
	return &AuthService{}
}

func (s *AuthService) RegisterRoutes(r *gin.Engine) {
	r.POST("/auth/login", s.handleLogin)
}

func (s *AuthService) handleLogin(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"message": "Login successful",
		"token":   "",
		"user": gin.H{
			"username": "superuser",
			"role":     "admin",
		},
	})
}
