import { useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { useAuth } from '@workspace/replit-auth-web';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Shell } from '@/components/shell';
import NotFound from '@/pages/not-found';
import Dashboard from '@/pages/dashboard';
import SignIn from '@/pages/sign-in';
import SetPassword from '@/pages/set-password';
import Programs from '@/pages/programs';
import ProgramDetail from '@/pages/program-detail';
import Workouts from '@/pages/workouts';
import Progress from '@/pages/progress';
import Clients from '@/pages/clients';
import Settings from '@/pages/settings';
import Join from '@/pages/join';
import { INVITE_KEY } from '@/lib/pl';
import { useWorkspace } from '@/hooks/use-platform';
import { EmptyState, LoadingPage } from '@/components/common';
import MyPrograms from '@/pages/my-programs';

function CoachOnly({children}:{children:ReactNode}) {
  const {data,isLoading}=useWorkspace();
  if(isLoading) return <LoadingPage />;
  if(!data?.isCoach) return <EmptyState title="Coach-only page" body="Your assigned training is available under My programs." />;
  return <>{children}</>;
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
  return (
    <Shell>
      <InviteResume />
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/sign-in" component={SignIn} />
          <Route path="/set-password" component={SetPassword} />
          <Route path="/my-programs" component={MyPrograms} />
          <Route path="/programs"><CoachOnly><Programs /></CoachOnly></Route>
          <Route path="/programs/:id"><CoachOnly><ProgramDetail /></CoachOnly></Route>
          <Route path="/workouts" component={Workouts} />
          <Route path="/progress" component={Progress} />
          <Route path="/clients"><CoachOnly><Clients /></CoachOnly></Route>
          <Route path="/settings" component={Settings} />
          <Route path="/join" component={Join} />
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
