import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index.tsx";
import Auth from "./pages/Auth.tsx";
import Bids from "./pages/Bids.tsx";
import Performances from "./pages/Performances.tsx";
import Careers from "./pages/Careers.tsx";
import Overlaps from "./pages/Overlaps.tsx";
import SimilarServices from "./pages/SimilarServices.tsx";
import PerformanceDatabase from "./pages/PerformanceDatabase.tsx";
import ExternalPerformanceDatabase from "./pages/ExternalPerformanceDatabase.tsx";
import AdminUsers from "./pages/AdminUsers.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
          <Route path="/bids" element={<ProtectedRoute><Bids /></ProtectedRoute>} />
          <Route path="/performances" element={<ProtectedRoute><Performances /></ProtectedRoute>} />
          <Route path="/careers" element={<ProtectedRoute><Careers /></ProtectedRoute>} />
          <Route path="/overlaps" element={<ProtectedRoute><Overlaps /></ProtectedRoute>} />
          <Route path="/similar-services" element={<ProtectedRoute><SimilarServices /></ProtectedRoute>} />
          <Route path="/performance-database" element={<ProtectedRoute><PerformanceDatabase /></ProtectedRoute>} />
          <Route path="/external-performance-database" element={<ProtectedRoute><ExternalPerformanceDatabase /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
