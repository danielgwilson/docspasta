import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { ToastProvider } from "@/components/ui/toast";
import Home from "./pages/Home";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Switch>
          <Route path="/" component={Home} />
        </Switch>
        <Toaster />
      </ToastProvider>
    </QueryClientProvider>
  );
}

export default App;
