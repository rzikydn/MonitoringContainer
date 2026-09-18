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
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarMenuAction,
} from './dashboard/Sidebar';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './dashboard/Collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from './dashboard/DropdownMenu';
import {
  Activity,
  LayoutDashboard,
  Boxes,
  Network,
  Terminal,
  Bell,
  Rocket,
  PlusCircle,
  Server,
  Cpu,
  Folder,
  FolderPlus,
  Sliders,
  Settings,
  ChevronRight,
  ChevronsUpDown,
  LogOut,
  BadgeCheck,
  CreditCard,
  Sparkles,
  Plus,
  Trash2,
  Forward,
  MoreHorizontal,
  Layers,
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
import { fetchNamespaces, createNamespace, deleteNamespace } from '../services/api';

const CLUSTERS_DATA = [
  {
    name: 'Production Cluster',
    subtext: 'VM 141 & 142 (Active)',
    logo: Activity,
    plan: 'High Availability',
  },
  {
    name: 'Staging Cluster',
    subtext: 'VM 143 (Standalone)',
    logo: Server,
    plan: 'Single Node',
  },
  {
    name: 'Development Cluster',
    subtext: 'Local Kind / Minikube',
    logo: Layers,
    plan: 'Dev Sandboxed',
  },
];

export default function DashboardPage({ user, onLogout }) {
  const isMobile = useIsMobile();
  const [activeCluster, setActiveCluster] = useState(CLUSTERS_DATA[0]);
  const [activeTab, setActiveTab] = useState('cluster-overview');
  const [selectedNamespace, setSelectedNamespace] = useState('');
  const [selectedPodForLogs, setSelectedPodForLogs] = useState('all');
  const [namespaces, setNamespaces] = useState([]);

  const loadNamespaces = () => {
    fetchNamespaces().then((data) => {
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
  const [newNsCpuQuota, setNewNsCpuQuota] = useState('2.0');
  const [newNsMemoryQuota, setNewNsMemoryQuota] = useState('4.0');
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
      await createNamespace(formattedName, newNsDesc || 'Custom Project', newNsCpuQuota, newNsMemoryQuota);
      loadNamespaces();
      setSelectedNamespace(formattedName);
      setActiveTab('namespace-detail');
      setShowNewNamespaceModal(false);
      setNewNsName('');
      setNewNsDesc('');
      setNewNsCpuQuota('2.0');
      setNewNsMemoryQuota('4.0');
    } catch (err) {
      setNamespaceActionError(err.message);
    }
  };

  const handleDeleteNamespace = async (nsName) => {
    if (namespaces.length <= 1) {
      alert('Cluster requires at least one namespace.');
      return;
    }
    try {
      await deleteNamespace(nsName);
      const filtered = namespaces.filter((n) => n.name !== nsName);
      setNamespaces(filtered);
      if (selectedNamespace === nsName) {
        setSelectedNamespace(filtered[0].name);
      }
    } catch (err) {
      alert(`Gagal menghapus namespace: ${err.message}`);
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
      return { category: 'Configuration', page: 'Cluster Settings' };
    }
    return { category: 'Dashboard', page: 'Monitoring' };
  };

  const breadcrumb = getBreadcrumb();

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          {/* Cluster Switcher */}
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  >
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
                      <activeCluster.logo style={{ width: '16px', height: '16px' }} />
                    </div>
                    <div
                      className="grid flex-1 text-left text-sm leading-tight"
                      style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '2px' }}
                    >
                      <span
                        className="truncate font-semibold"
                        style={{ fontSize: '0.86rem', fontWeight: 600, color: '#0F172A' }}
                      >
                        {activeCluster.name}
                      </span>
                      <span className="truncate text-xs" style={{ fontSize: '0.74rem', color: '#64748B' }}>
                        {activeCluster.subtext}
                      </span>
                    </div>
                    <ChevronsUpDown className="ml-auto" style={{ width: '14px', height: '14px', color: '#64748B' }} />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                  align="start"
                  side={isMobile ? 'bottom' : 'right'}
                  sideOffset={4}
                >
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Active Clusters
                  </DropdownMenuLabel>
                  {CLUSTERS_DATA.map((cluster, index) => (
                    <DropdownMenuItem
                      key={cluster.name}
                      onClick={() => setActiveCluster(cluster)}
                      className="gap-2 p-2"
                    >
                      <div
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '4px',
                          border: '1px solid #E2E8F0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <cluster.logo style={{ width: '14px', height: '14px', color: '#284C6E' }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 500, fontSize: '0.84rem' }}>{cluster.name}</span>
                        <span style={{ fontSize: '0.72rem', color: '#64748B' }}>{cluster.plan}</span>
                      </div>
                      <DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="gap-2 p-2"
                    onClick={() => alert('Add new Kubernetes node / cluster wizard')}
                  >
                    <div
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '6px',
                        border: '1px solid #E2E8F0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#FFFFFF',
                      }}
                    >
                      <Plus className="size-4" style={{ width: '14px', height: '14px' }} />
                    </div>
                    <div className="font-medium text-muted-foreground" style={{ fontSize: '0.84rem' }}>
                      Add Cluster
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
              <Collapsible defaultOpen={true} asChild className="group/collapsible">
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      tooltip="Cluster Overview"
                      className={activeTab === 'cluster-overview' ? 'active' : ''}
                      onClick={() => setActiveTab('cluster-overview')}
                    >
                      <LayoutDashboard />
                      <span>Cluster Overview</span>
                      <ChevronRight className="ml-auto transition-transform duration-300 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          className={activeTab === 'cluster-overview' ? 'active' : ''}
                          onClick={() => setActiveTab('cluster-overview')}
                        >
                          <button style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                            <span>Capacity & Nodes</span>
                          </button>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          onClick={() => setActiveTab('cluster-overview')}
                        >
                          <button style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                            <span>Failover Indicator</span>
                          </button>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>

              {/* 2. Workloads & Pods */}
              <Collapsible defaultOpen={false} asChild className="group/collapsible">
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      tooltip="Workloads & Pods"
                      className={activeTab === 'workloads-pods' ? 'active' : ''}
                      onClick={() => setActiveTab('workloads-pods')}
                    >
                      <Boxes />
                      <span>Workloads & Pods</span>
                      <ChevronRight className="ml-auto transition-transform duration-300 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          onClick={() => setActiveTab('workloads-pods')}
                        >
                          <button style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                            <span>Deployments List</span>
                          </button>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          onClick={() => setActiveTab('workloads-pods')}
                        >
                          <button style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                            <span>Pod Status & Metrics</span>
                          </button>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>

              {/* 3. Network & Ingress */}
              <Collapsible defaultOpen={false} asChild className="group/collapsible">
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      tooltip="Network & Ingress"
                      className={activeTab === 'network-ingress' ? 'active' : ''}
                      onClick={() => setActiveTab('network-ingress')}
                    >
                      <Network />
                      <span>Network & Ingress</span>
                      <ChevronRight className="ml-auto transition-transform duration-300 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          onClick={() => setActiveTab('network-ingress')}
                        >
                          <button style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                            <span>Services (ClusterIP/NodePort)</span>
                          </button>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton
                          asChild
                          onClick={() => setActiveTab('network-ingress')}
                        >
                          <button style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                            <span>HTTP Health Checks</span>
                          </button>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>

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
                  onClick={() => setActiveTab('app-services')}
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
                  tooltip="Cluster Settings"
                  className={activeTab === 'cluster-settings' ? 'active' : ''}
                  onClick={() => setActiveTab('cluster-settings')}
                >
                  <Sliders />
                  <span>Cluster Settings</span>
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
                      <Sparkles />
                      Cluster Capacity Add-on
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => setActiveTab('cluster-settings')}>
                      <BadgeCheck />
                      Security & Roles
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

            {/* Direct Logout Button */}
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => {
                  if (onLogout) onLogout();
                }}
                className="logout-direct-btn"
                tooltip="Log out"
              >
                <LogOut style={{ width: '15px', height: '15px' }} />
                <span>Log out</span>
              </SidebarMenuButton>
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
                  {activeCluster.name}
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
          {activeTab === 'cluster-overview' && (
            <ClusterOverviewView onNavigate={(tab) => setActiveTab(tab)} />
          )}

          {activeTab === 'workloads-pods' && (
            <WorkloadsPodsView
              onNavigateToLogs={(podName) => {
                setSelectedPodForLogs(podName);
                setActiveTab('live-logs');
              }}
            />
          )}

          {activeTab === 'network-ingress' && <NetworkIngressView />}

          {activeTab === 'live-logs' && (
            <LiveLogsView initialPod={selectedPodForLogs} />
          )}

          {activeTab === 'alerts-events' && <AlertsEventsView />}

          {activeTab === 'deploy-app' && (
            <DeployAppView
              onDeployed={() => {
                setTimeout(() => setActiveTab('workloads-pods'), 1500);
              }}
            />
          )}

          {activeTab === 'app-services' && <AppServicesView />}

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
              Segregate projects and assign independent quotas instantly across cluster nodes without provisioning new physical servers.
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
                  <label className="dash-form-label">Default CPU Quota</label>
                  <select
                    className="dash-form-select"
                    value={newNsCpuQuota}
                    onChange={(e) => setNewNsCpuQuota(e.target.value)}
                  >
                    <option value="1.0">1.0 Core</option>
                    <option value="2.0">2.0 Cores (Standard)</option>
                    <option value="4.0">4.0 Cores (High)</option>
                  </select>
                </div>

                <div className="dash-form-group">
                  <label className="dash-form-label">Default RAM Limit</label>
                  <select
                    className="dash-form-select"
                    value={newNsMemoryQuota}
                    onChange={(e) => setNewNsMemoryQuota(e.target.value)}
                  >
                    <option value="2.0">2.0 GB</option>
                    <option value="4.0">4.0 GB (Standard)</option>
                    <option value="8.0">8.0 GB (High)</option>
                  </select>
                </div>
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
