import { useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { useAuth } from '@workspace/replit-auth-web';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Shell } from '@/components/shell';
import NotFound from '@/pages/not-found';
import Dashboard from '@/pages/dashboard';
import SignIn from '@/pages/sign-in';
import SignUp from '@/pages/sign-up';
import SetPassword from '@/pages/set-password';
import Programs from '@/pages/programs';
import ProgramDetail from '@/pages/program-detail';
import Workouts from '@/pages/workouts';
import Progress from '@/pages/progress';
import LiftingGroupPage from '@/pages/group';
import JoinGroup from '@/pages/join-group';
import Settings from '@/pages/settings';
import Join from '@/pages/join';
import { GROUP_INVITE_KEY, INVITE_KEY } from '@/lib/pl';
import { useWorkspace } from '@/hooks/use-platform';
import { EmptyState, LoadingPage } from '@/components/common';
import MyPrograms from '@/pages/my-programs';
import Coaches from '@/pages/coaches';

function AdminOnly({children}:{children:ReactNode}) {
  const {data,isLoading}=useWorkspace();
  if(isLoading) return <LoadingPage />;
  if(!data?.isAdmin) return <EmptyState title="Admin-only page" body="Only the team administrator can view lifters and groups." />;
  return <>{children}</>;
}

/** Admin accounts without coach rights manage coaches and their own settings only. */
function NotAdminOnly({children}:{children:ReactNode}) {
  const {data,isLoading}=useWorkspace();
  if(isLoading) return <LoadingPage />;
  if(data && !isLifter(data)) return <EmptyState title="Not available for admin accounts" body="Admin accounts have a read-only directory of lifters and groups. Training and the program library belong to lifter accounts." />;
  return <>{children}</>;
}

function HomeRoute() {
  const {data,isLoading}=useWorkspace();
  if(isLoading) return <LoadingPage />;
  return data && !isLifter(data) ? <Coaches /> : <Dashboard />;
}

function isLifter(d:{isLifter?:boolean;isAdmin?:boolean}) { return d.isLifter ?? !d.isAdmin; }

/** Every non-admin account is a lifter with full library and self-assignment access. */
function LifterOnly({children}:{children:ReactNode}) {
  const {data,isLoading}=useWorkspace();
  if(isLoading) return <LoadingPage />;
  if(!data || !isLifter(data)) return <EmptyState title="Lifter-only page" body="Admin accounts have read-only access to the Lifters & groups directory." />;
  return <>{children}</>;
}

/** Resume a group invitation after a full-reload sign-in. Independent of InviteResume. */
function GroupInviteResume() {
  const [loc, setLocation] = useLocation();
  useEffect(() => {
    if (loc === '/join-group') return;
    if (sessionStorage.getItem(GROUP_INVITE_KEY)) setLocation('/join-group');
  }, [loc, setLocation]);
  return null;
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 20_000, refetchOnWindowFocus: true, retry: 1 } },
});

/** If an invite token was stashed before login, resume acceptance on return. */
function InviteResume() {
  const { isAuthenticated } = useAuth();
  const [loc, setLocation] = useLocation();
  useEffect(() => {
    if (!isAuthenticated || loc === '/join') return;
    const t = sessionStorage.getItem(INVITE_KEY);
    if (t) setLocation(`/join?token=${encodeURIComponent(t)}`);
  }, [isAuthenticated, loc, setLocation]);
  return null;
}

function Router() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <LoadingPage />;
  if (!isAuthenticated) {
    return <main className="min-h-screen bg-background px-4 py-6">
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/sign-in" component={SignIn} />
          <Route path="/sign-up" component={SignUp} />
          <Route path="/set-password" component={SetPassword} />
          <Route path="/join" component={Join} />
          <Route path="/join-group" component={JoinGroup} />
          <Route><Redirect to="/sign-in" replace /></Route>
        </Switch>
      </RoutedErrorBoundary>
    </main>;
  }
  return (
    <Shell>
      <InviteResume />
      <GroupInviteResume />
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={HomeRoute} />
          <Route path="/sign-in" component={SignIn} />
          <Route path="/set-password" component={SetPassword} />
          <Route path="/my-programs"><NotAdminOnly><MyPrograms /></NotAdminOnly></Route>
          <Route path="/my-training"><NotAdminOnly><MyPrograms /></NotAdminOnly></Route>
          <Route path="/my-blocks"><NotAdminOnly><MyPrograms /></NotAdminOnly></Route>
          <Route path="/coaches"><AdminOnly><Coaches /></AdminOnly></Route>
          <Route path="/programs"><LifterOnly><Programs /></LifterOnly></Route>
          <Route path="/programs/:id"><LifterOnly><ProgramDetail /></LifterOnly></Route>
          <Route path="/workouts"><NotAdminOnly><Workouts /></NotAdminOnly></Route>
          <Route path="/progress"><NotAdminOnly><Progress /></NotAdminOnly></Route>
          <Route path="/group"><LifterOnly><LiftingGroupPage /></LifterOnly></Route>
          <Route path="/clients"><Redirect to="/group" replace /></Route>
          <Route path="/settings" component={Settings} />
          <Route path="/join" component={Join} />
          <Route path="/join-group" component={JoinGroup} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </Shell>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
