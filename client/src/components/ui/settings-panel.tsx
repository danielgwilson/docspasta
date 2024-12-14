import { useState, useEffect } from "react";
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger 
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";

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
    <Accordion type="single" collapsible>
      <AccordionItem value="settings">
        <AccordionTrigger>Settings</AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                OpenAI API Key
              </label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => handleApiKeyChange(e.target.value)}
                placeholder="sk-..."
              />
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
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
