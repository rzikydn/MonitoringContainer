'use client';

import React, { useState, useEffect } from 'react';
import './dashboard/sidebar.css';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from './dashboard/Breadcrumb';
import { Separator } from './dashboard/Separator';
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarRail,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
} from './dashboard/Sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dashboard/DropdownMenu';
import {
  LayoutDashboard,
  Boxes,
  Network,
  Terminal,
  Bell,
  Rocket,
  Server,
  Cpu,
  Folder,
  FolderPlus,
  Sliders,
  ChevronsUpDown,
  LogOut,
  Plus,
  Trash2,
  Forward,
  MoreHorizontal,
  X,
} from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from './dashboard/Avatar';
import { useIsMobile } from '../hooks/use-mobile';

// Subviews
import ClusterOverviewView from './dashboard/views/ClusterOverviewView';
import WorkloadsPodsView from './dashboard/views/WorkloadsPodsView';
import NetworkIngressView from './dashboard/views/NetworkIngressView';
import LiveLogsView from './dashboard/views/LiveLogsView';
import AlertsEventsView from './dashboard/views/AlertsEventsView';
import DeployAppView from './dashboard/views/DeployAppView';
import AppServicesView from './dashboard/views/AppServicesView';
import NamespaceDetailView from './dashboard/views/NamespaceDetailView';
import ClusterSettingsView from './dashboard/views/ClusterSettingsView';
import { apiClient } from '../services/api';

export default function DashboardPage({ user, onLogout }) {
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState('cluster-overview');
  const [selectedNamespace, setSelectedNamespace] = useState('');
  const [selectedLogTarget, setSelectedLogTarget] = useState(null);
  const [namespaces, setNamespaces] = useState([]);
  const [appServicesNamespaceFilter, setAppServicesNamespaceFilter] = useState('All');

  const loadNamespaces = () => {
    apiClient.fetchNamespaces().then((data) => {
      const mapped = data.map((ns) => ({ ...ns, icon: Folder }));
      setNamespaces(mapped);
      setSelectedNamespace((current) => current || (mapped[0] && mapped[0].name) || '');
    });
  };

  useEffect(() => {
    loadNamespaces();
  }, []);

  // New Namespace Modal State
  const [showNewNamespaceModal, setShowNewNamespaceModal] = useState(false);
  const [newNsName, setNewNsName] = useState('');
  const [newNsDesc, setNewNsDesc] = useState('');
  const [newNsCpuRequest, setNewNsCpuRequest] = useState('2.0');
  const [newNsCpuLimit, setNewNsCpuLimit] = useState('4.0');
  const [newNsMemoryRequest, setNewNsMemoryRequest] = useState('4.0');
  const [newNsMemoryLimit, setNewNsMemoryLimit] = useState('8.0');
  const [newNsPodsQuota, setNewNsPodsQuota] = useState('10');
  const [namespaceActionError, setNamespaceActionError] = useState('');

  const userData = {
    name: user?.name || 'Super User',
    email: user?.username ? `${user.username}@bsmr.com` : 'superuser@bsmr.com',
    avatar:
      'https://pbs.twimg.com/profile_images/1909615404789506048/MTqvRsjo_400x400.jpg',
    initials: user?.avatar || 'SU',
  };

  const handleCreateNamespace = async (e) => {
    e.preventDefault();
    if (!newNsName.trim()) return;
    const formattedName = newNsName.trim().toLowerCase().replace(/\s+/g, '-');
    setNamespaceActionError('');
    try {
      await apiClient.createNamespace(formattedName, {
        description: newNsDesc || 'Custom Project',
        cpuRequest: newNsCpuRequest,
        cpuLimit: newNsCpuLimit,
        memoryRequest: newNsMemoryRequest,
        memoryLimit: newNsMemoryLimit,
        podsQuota: newNsPodsQuota,
      });
      loadNamespaces();
      setSelectedNamespace(formattedName);
      setActiveTab('namespace-detail');
      setShowNewNamespaceModal(false);
      setNewNsName('');
      setNewNsDesc('');
      setNewNsCpuRequest('2.0');
      setNewNsCpuLimit('4.0');
      setNewNsMemoryRequest('4.0');
      setNewNsMemoryLimit('8.0');
      setNewNsPodsQuota('10');
    } catch (err) {
      setNamespaceActionError(err.message);
    }
  };

  const handleDeleteNamespace = async (nsName) => {
    if (namespaces.length <= 1) {
      alert('You need to keep at least one namespace.');
      return;
    }
    if (!window.confirm(`Delete namespace "${nsName}"? This permanently removes every pod, service, and resource inside it. This cannot be undone.`)) {
      return;
    }
    try {
      await apiClient.deleteNamespace(nsName);
      const filtered = namespaces.filter((n) => n.name !== nsName);
      setNamespaces(filtered);
      if (selectedNamespace === nsName) {
        setSelectedNamespace(filtered[0].name);
      }
    } catch (err) {
      alert(`Couldn't delete namespace: ${err.message}`);
    }
  };

  // Compute Breadcrumb trail
  const getBreadcrumb = () => {
    if (activeTab === 'cluster-overview') {
      return { category: 'Monitoring & Observability', page: 'Cluster Overview' };
    }
    if (activeTab === 'workloads-pods') {
      return { category: 'Monitoring & Observability', page: 'Workloads & Pods' };
    }
    if (activeTab === 'network-ingress') {
      return { category: 'Monitoring & Observability', page: 'Network & Ingress' };
    }
    if (activeTab === 'live-logs') {
      return { category: 'Monitoring & Observability', page: 'Live Logs' };
    }
    if (activeTab === 'alerts-events') {
      return { category: 'Monitoring & Observability', page: 'Alerts & Events' };
    }
    if (activeTab === 'deploy-app') {
      return { category: 'Management & Deploy', page: 'Deploy New App' };
    }
    if (activeTab === 'app-services') {
      return { category: 'Management & Deploy', page: 'App Services' };
    }
    if (activeTab === 'namespace-detail') {
      return { category: 'Namespaces', page: `${selectedNamespace} (Quota & Limits)` };
    }
    if (activeTab === 'cluster-settings') {
      return { category: 'Configuration', page: 'Notification Settings' };
    }
    return { category: 'Dashboard', page: 'Monitoring' };
  };

  const breadcrumb = getBreadcrumb();

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          {/* Identitas cluster real (bukan lagi switcher multi-cluster palsu —
              backend ini hanya pernah terhubung ke satu cluster) */}
          <SidebarMenu>
            <SidebarMenuItem>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    backgroundColor: '#284C6E',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Server style={{ width: '16px', height: '16px' }} />
                </div>
                <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span className="truncate font-semibold" style={{ fontSize: '0.86rem', fontWeight: 600, color: '#0F172A' }}>
                    Kubernetes Cluster
                  </span>
                  <span className="truncate text-xs" style={{ fontSize: '0.74rem', color: '#64748B' }}>
                    {namespaces.length} namespace{namespaces.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          {/* =========================================================
              Kategori 1: MONITORING & OBSERVABILITY (Menggantikan PLATFORM)
              ========================================================= */}
          <SidebarGroup>
            <SidebarGroupLabel>MONITORING & OBSERVABILITY</SidebarGroupLabel>
            <SidebarMenu>
              {/* 1. Cluster Overview */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Cluster Overview"
                  className={activeTab === 'cluster-overview' ? 'active' : ''}
                  onClick={() => setActiveTab('cluster-overview')}
                >
                  <LayoutDashboard />
                  <span>Cluster Overview</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* 2. Workloads & Pods */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Workloads & Pods"
                  className={activeTab === 'workloads-pods' ? 'active' : ''}
                  onClick={() => setActiveTab('workloads-pods')}
                >
                  <Boxes />
                  <span>Workloads & Pods</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* 3. Network & Ingress */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Network & Ingress"
                  className={activeTab === 'network-ingress' ? 'active' : ''}
                  onClick={() => setActiveTab('network-ingress')}
                >
                  <Network />
                  <span>Network & Ingress</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* 4. Live Logs */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Live Logs"
                  className={activeTab === 'live-logs' ? 'active' : ''}
                  onClick={() => setActiveTab('live-logs')}
                >
                  <Terminal />
                  <span>Live Logs</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* 5. Alerts & Events */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Alerts & Events"
                  className={activeTab === 'alerts-events' ? 'active' : ''}
                  onClick={() => setActiveTab('alerts-events')}
                >
                  <Bell />
                  <span>Alerts & Events</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>

          {/* =========================================================
              Kategori 2: MANAGEMENT & DEPLOY (Menu Aksi & Operasional)
              ========================================================= */}
          <SidebarGroup>
            <SidebarGroupLabel>MANAGEMENT & DEPLOY</SidebarGroupLabel>
            <SidebarMenu>
              {/* Deploy New App */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Deploy New App"
                  className={activeTab === 'deploy-app' ? 'active' : ''}
                  onClick={() => setActiveTab('deploy-app')}
                >
                  <Rocket />
                  <span>Deploy New App</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* App Services */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="App Services"
                  className={activeTab === 'app-services' ? 'active' : ''}
                  onClick={() => {
                    setAppServicesNamespaceFilter('All');
                    setActiveTab('app-services');
                  }}
                >
                  <Cpu />
                  <span>App Services</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>

          {/* =========================================================
              Kategori 3: NAMESPACES (Menggantikan menu PROJECTS lama)
              ========================================================= */}
          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel>NAMESPACES</SidebarGroupLabel>
            <SidebarMenu>
              {namespaces.map((item) => (
                <SidebarMenuItem key={item.name}>
                  <SidebarMenuButton
                    className={
                      activeTab === 'namespace-detail' && selectedNamespace === item.name
                        ? 'active'
                        : ''
                    }
                    onClick={() => {
                      setSelectedNamespace(item.name);
                      setActiveTab('namespace-detail');
                    }}
                  >
                    <item.icon />
                    <span>{item.name}</span>
                  </SidebarMenuButton>

                  <DropdownMenu className="sidebar-menu-action-dropdown">
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuAction showOnHover>
                        <MoreHorizontal />
                        <span className="sr-only">More</span>
                      </SidebarMenuAction>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      className="w-48 rounded-lg"
                      side="bottom"
                      align="end"
                    >
                      <DropdownMenuItem
                        onClick={() => {
                          setSelectedNamespace(item.name);
                          setActiveTab('namespace-detail');
                        }}
                      >
                        <Folder className="text-muted-foreground" />
                        <span>View Quota & Limits</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setAppServicesNamespaceFilter(item.name);
                          setActiveTab('app-services');
                        }}
                      >
                        <Forward className="text-muted-foreground" />
                        <span>Scale Workloads</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => handleDeleteNamespace(item.name)}
                        style={{ color: '#EF4444' }}
                      >
                        <Trash2 className="text-muted-foreground" style={{ color: '#EF4444' }} />
                        <span>Delete Namespace</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              ))}

              {/* + New Namespace Button */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => setShowNewNamespaceModal(true)}
                  style={{ color: '#284C6E', fontWeight: 600 }}
                >
                  <Plus style={{ color: '#284C6E' }} />
                  <span>New Namespace</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>

          {/* =========================================================
              Kategori 4: SETTINGS (Paling Bawah)
              ========================================================= */}
          <SidebarGroup>
            <SidebarGroupLabel>SETTINGS</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Notification Settings"
                  className={activeTab === 'cluster-settings' ? 'active' : ''}
                  onClick={() => setActiveTab('cluster-settings')}
                >
                  <Sliders />
                  <span>Notification Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          {/* Nav User */}
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  >
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarImage
                        src={userData.avatar}
                        alt={userData.name}
                      />
                      <AvatarFallback className="rounded-lg">
                        {userData.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div
                      className="grid flex-1 text-left text-sm leading-tight"
                      style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '2px' }}
                    >
                      <span
                        className="truncate font-semibold"
                        style={{ fontSize: '0.86rem', fontWeight: 600, color: '#0F172A' }}
                      >
                        {userData.name}
                      </span>
                      <span className="truncate text-xs" style={{ fontSize: '0.74rem', color: '#64748B' }}>
                        {userData.email}
                      </span>
                    </div>
                    <ChevronsUpDown className="ml-auto size-4" style={{ width: '14px', height: '14px', color: '#64748B' }} />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                  side={isMobile ? 'bottom' : 'right'}
                  align="end"
                  sideOffset={4}
                >
                  <DropdownMenuLabel className="p-0 font-normal">
                    <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px' }}>
                      <Avatar className="h-8 w-8 rounded-lg">
                        <AvatarImage
                          src={userData.avatar}
                          alt={userData.name}
                        />
                        <AvatarFallback className="rounded-lg">
                          {userData.initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="grid flex-1 text-left text-sm leading-tight" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span className="truncate font-semibold" style={{ fontSize: '0.86rem', fontWeight: 600, color: '#0F172A' }}>
                          {userData.name}
                        </span>
                        <span className="truncate text-xs" style={{ fontSize: '0.74rem', color: '#64748B' }}>
                          {userData.email}
                        </span>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => setActiveTab('cluster-settings')}>
                      <Sliders />
                      Notification Settings
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setActiveTab('alerts-events')}>
                      <Bell />
                      Cluster Alerts
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      if (onLogout) onLogout();
                    }}
                    style={{ color: '#EF4444' }}
                  >
                    <LogOut style={{ color: '#EF4444' }} />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="sidebar-inset-header">
          <SidebarTrigger />
          <Separator orientation="vertical" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="#" onClick={(e) => { e.preventDefault(); setActiveTab('cluster-overview'); }}>
                  Kubernetes Cluster
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="#" onClick={(e) => e.preventDefault()}>
                  {breadcrumb.category}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>{breadcrumb.page}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>

        {/* Content View Routing */}
        <div className="sidebar-inset-content">
          {activeTab === 'cluster-overview' && <ClusterOverviewView />}

          {activeTab === 'workloads-pods' && (
            <WorkloadsPodsView
              onNavigateToLogs={(namespace, name) => {
                setSelectedLogTarget({ namespace, name });
                setActiveTab('live-logs');
              }}
            />
          )}

          {activeTab === 'network-ingress' && <NetworkIngressView />}

          {activeTab === 'live-logs' && (
            <LiveLogsView initialTarget={selectedLogTarget} />
          )}

          {activeTab === 'alerts-events' && <AlertsEventsView />}

          {activeTab === 'deploy-app' && (
            <DeployAppView
              onDeployed={() => {
                setTimeout(() => setActiveTab('workloads-pods'), 1500);
              }}
            />
          )}

          {activeTab === 'app-services' && (
            <AppServicesView
              initialNamespace={appServicesNamespaceFilter}
              onNamespaceFilterChange={setAppServicesNamespaceFilter}
            />
          )}

          {activeTab === 'namespace-detail' && (
            <NamespaceDetailView
              namespaceKey={selectedNamespace}
              namespaceMeta={namespaces.find((n) => n.name === selectedNamespace)}
            />
          )}

          {activeTab === 'cluster-settings' && <ClusterSettingsView />}
        </div>
      </SidebarInset>

      {/* Modal: + New Namespace (Fitur 3 & 4) */}
      {showNewNamespaceModal && (
        <div className="dash-modal-backdrop" onClick={() => setShowNewNamespaceModal(false)}>
          <div className="dash-modal-box" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FolderPlus style={{ width: '20px', height: '20px', color: '#284C6E' }} />
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0F172A' }}>
                  Create New Namespace
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewNamespaceModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X style={{ width: '18px', height: '18px' }} />
              </button>
            </div>

            <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748B' }}>
              Every new namespace automatically gets its own resource quota, network isolation, and scoped permissions — just fill out this form, no command line needed.
            </p>

            {namespaceActionError && (
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#B91C1C', backgroundColor: '#FEF2F2', padding: '8px 10px', borderRadius: '8px' }}>
                {namespaceActionError}
              </p>
            )}

            <form onSubmit={handleCreateNamespace} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="dash-form-group">
                <label className="dash-form-label">Namespace Identifier *</label>
                <input
                  type="text"
                  placeholder="e.g. audit-service or analytics-prod"
                  value={newNsName}
                  onChange={(e) => setNewNsName(e.target.value)}
                  className="dash-form-input"
                  required
                  autoFocus
                />
              </div>

              <div className="dash-form-group">
                <label className="dash-form-label">Description / Subtitle</label>
                <input
                  type="text"
                  placeholder="e.g. Modul Compliance & Audit Trail"
                  value={newNsDesc}
                  onChange={(e) => setNewNsDesc(e.target.value)}
                  className="dash-form-input"
                />
              </div>

              <div className="dash-form-grid">
                <div className="dash-form-group">
                  <label className="dash-form-label">CPU Request Quota (requests.cpu)</label>
                  <select
                    className="dash-form-select"
                    value={newNsCpuRequest}
                    onChange={(e) => setNewNsCpuRequest(e.target.value)}
                  >
                    <option value="1.0">1.0 Core</option>
                    <option value="2.0">2.0 Cores (Standard)</option>
                    <option value="4.0">4.0 Cores (High)</option>
                  </select>
                </div>

                <div className="dash-form-group">
                  <label className="dash-form-label">CPU Limit Quota (limits.cpu)</label>
                  <select
                    className="dash-form-select"
                    value={newNsCpuLimit}
                    onChange={(e) => setNewNsCpuLimit(e.target.value)}
                  >
                    <option value="2.0">2.0 Cores</option>
                    <option value="4.0">4.0 Cores (Standard)</option>
                    <option value="8.0">8.0 Cores (High)</option>
                  </select>
                </div>
              </div>

              <div className="dash-form-grid">
                <div className="dash-form-group">
                  <label className="dash-form-label">Memory Request Quota (requests.memory)</label>
                  <select
                    className="dash-form-select"
                    value={newNsMemoryRequest}
                    onChange={(e) => setNewNsMemoryRequest(e.target.value)}
                  >
                    <option value="2.0">2.0 GB</option>
                    <option value="4.0">4.0 GB (Standard)</option>
                    <option value="8.0">8.0 GB (High)</option>
                  </select>
                </div>

                <div className="dash-form-group">
                  <label className="dash-form-label">Memory Limit Quota (limits.memory)</label>
                  <select
                    className="dash-form-select"
                    value={newNsMemoryLimit}
                    onChange={(e) => setNewNsMemoryLimit(e.target.value)}
                  >
                    <option value="4.0">4.0 GB</option>
                    <option value="8.0">8.0 GB (Standard)</option>
                    <option value="16.0">16.0 GB (High)</option>
                  </select>
                </div>
              </div>

              <div className="dash-form-group">
                <label className="dash-form-label">Max Pods Quota</label>
                <select
                  className="dash-form-select"
                  value={newNsPodsQuota}
                  onChange={(e) => setNewNsPodsQuota(e.target.value)}
                >
                  <option value="5">5 Pods</option>
                  <option value="10">10 Pods (Standard)</option>
                  <option value="20">20 Pods (High)</option>
                  <option value="50">50 Pods</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowNewNamespaceModal(false)}
                  className="btn-dash btn-dash-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-dash btn-dash-primary"
                >
                  <Plus style={{ width: '14px', height: '14px' }} />
                  Create Namespace
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </SidebarProvider>
  );
}
