import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { Settings, Trash2 } from "lucide-react";

export default function SettingsPanel() {
  const [apiKey, setApiKey] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    const savedKey = localStorage.getItem("openai_api_key");
    if (savedKey) {
      setApiKey(savedKey);
    }
  }, []);

  const testKeyMutation = useMutation({
    mutationFn: async (key: string) => {
      const response = await fetch("/api/test-key", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ apiKey: key }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "API Key Valid",
        description: "Your OpenAI API key was validated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Invalid API Key",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    localStorage.setItem("openai_api_key", value);
  };

  const handleTest = () => {
    if (!apiKey) {
      toast({
        title: "Error",
        description: "Please enter an API key first",
        variant: "destructive",
      });
      return;
    }
    testKeyMutation.mutate(apiKey);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Settings className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              OpenAI API Key
            </label>
            <div className="flex gap-2">
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => handleApiKeyChange(e.target.value)}
                placeholder="sk-..."
              />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="icon">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear API Key?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove your saved OpenAI API key. You'll need to enter it again to use the application.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => {
                      localStorage.removeItem("openai_api_key");
                      setApiKey("");
                      toast({
                        title: "API Key Cleared",
                        description: "Your API key has been removed",
                      });
                    }}>
                      Clear
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            <p className="text-sm text-muted-foreground">
              API key is saved automatically
            </p>
          </div>
          <div>
            <Button 
              variant="outline" 
              onClick={handleTest}
              disabled={testKeyMutation.isPending}
            >
              {testKeyMutation.isPending ? "Testing..." : "Test Key"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
