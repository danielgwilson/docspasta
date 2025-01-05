import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const formSchema = z.object({
  url: z.string().url('Please enter a valid URL'),
  maxDepth: z.number().min(1).max(10),
  includeCodeBlocks: z.boolean(),
  excludeNavigation: z.boolean(),
  followExternalLinks: z.boolean(),
  includeAnchors: z.boolean(),
  rateLimit: z.number().min(100).max(5000),
  maxConcurrentRequests: z.number().min(1).max(10),
});

type FormData = z.infer<typeof formSchema>;

interface CrawlerFormProps {
  onSubmit: (data: FormData) => void;
  isProcessing: boolean;
  progress?: {
    processed: number;
    total: number;
    remaining: number;
  };
  error?: string;
}

export function CrawlerForm({
  onSubmit,
  isProcessing,
  progress,
  error,
}: CrawlerFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      url: '',
      maxDepth: 3,
      includeCodeBlocks: true,
      excludeNavigation: true,
      followExternalLinks: false,
      includeAnchors: false,
      rateLimit: 1000,
      maxConcurrentRequests: 5,
    },
  });

  const handleSubmit = form.handleSubmit((data) => {
    onSubmit(data);
  });

  const percentComplete = progress
    ? Math.round((progress.processed / Math.max(progress.total, 1)) * 100)
    : 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card className="p-6">
        <div className="space-y-4">
          {/* URL Input */}
          <div className="space-y-2">
            <Label htmlFor="url-input">Documentation URL</Label>
            <Input
              id="url-input"
              aria-label="Documentation URL"
              placeholder="https://docs.example.com"
              {...form.register('url')}
              className={cn(
                'w-full',
                form.formState.errors.url && 'border-red-500'
              )}
            />
            {form.formState.errors.url && (
              <p className="text-sm text-red-500">
                {form.formState.errors.url.message}
              </p>
            )}
          </div>

          {/* Basic Settings */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="max-depth">Maximum Crawl Depth</Label>
              <span className="text-sm text-gray-500">
                {form.watch('maxDepth')}
              </span>
            </div>
            <Slider
              id="max-depth"
              name="maxDepth"
              min={1}
              max={10}
              step={1}
              value={[form.watch('maxDepth')]}
              onValueChange={([value]) => form.setValue('maxDepth', value)}
            />
          </div>

          {/* Advanced Settings Toggle */}
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full">
            {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
          </Button>

          {/* Advanced Settings */}
          {showAdvanced && (
            <div className="space-y-4 pt-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="include-code-blocks">Include Code Blocks</Label>
                <Switch
                  id="include-code-blocks"
                  name="includeCodeBlocks"
                  checked={form.watch('includeCodeBlocks')}
                  onCheckedChange={(checked) =>
                    form.setValue('includeCodeBlocks', checked)
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="exclude-navigation">Exclude Navigation</Label>
                <Switch
                  id="exclude-navigation"
                  name="excludeNavigation"
                  checked={form.watch('excludeNavigation')}
                  onCheckedChange={(checked) =>
                    form.setValue('excludeNavigation', checked)
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="follow-external-links">
                  Follow External Links
                </Label>
                <Switch
                  id="follow-external-links"
                  name="followExternalLinks"
                  checked={form.watch('followExternalLinks')}
                  onCheckedChange={(checked) =>
                    form.setValue('followExternalLinks', checked)
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="include-anchors">Include Anchors</Label>
                <Switch
                  id="include-anchors"
                  name="includeAnchors"
                  checked={form.watch('includeAnchors')}
                  onCheckedChange={(checked) =>
                    form.setValue('includeAnchors', checked)
                  }
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="rate-limit">Rate Limit (ms)</Label>
                  <span className="text-sm text-gray-500">
                    {form.watch('rateLimit')}ms
                  </span>
                </div>
                <Slider
                  id="rate-limit"
                  name="rateLimit"
                  min={100}
                  max={5000}
                  step={100}
                  value={[form.watch('rateLimit')]}
                  onValueChange={([value]) => form.setValue('rateLimit', value)}
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="max-concurrent-requests">
                    Max Concurrent Requests
                  </Label>
                  <span className="text-sm text-gray-500">
                    {form.watch('maxConcurrentRequests')}
                  </span>
                </div>
                <Slider
                  id="max-concurrent-requests"
                  name="maxConcurrentRequests"
                  min={1}
                  max={10}
                  step={1}
                  value={[form.watch('maxConcurrentRequests')]}
                  onValueChange={([value]) =>
                    form.setValue('maxConcurrentRequests', value)
                  }
                />
              </div>
            </div>
          )}

          {/* Progress */}
          {isProcessing && progress && (
            <div className="space-y-2">
              <Progress value={percentComplete} className="w-full" />
              <div className="flex justify-between text-sm text-gray-500">
                <span>
                  {progress.processed} / {progress.total} pages processed
                </span>
                <span>{progress.remaining} remaining</span>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full"
            disabled={isProcessing || !form.formState.isValid}>
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Start Crawling
              </>
            )}
          </Button>
        </div>
      </Card>
    </form>
  );
}
