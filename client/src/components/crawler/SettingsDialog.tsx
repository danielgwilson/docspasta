import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Settings } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

interface SettingsDialogProps {
  settings: {
    maxDepth: number
    includeCodeBlocks: boolean
    excludeNavigation: boolean
    followExternalLinks: boolean
  }
  onSettingsChange: (settings: SettingsDialogProps['settings']) => void
}

export function SettingsDialog({ settings, onSettingsChange }: SettingsDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="w-8 h-8">
          <Settings className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crawler Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="max-depth">Maximum Crawl Depth</Label>
            <Slider
              id="max-depth"
              value={[settings.maxDepth]}
              onValueChange={([value]) => onSettingsChange({ ...settings, maxDepth: value })}
              max={10}
              min={1}
              step={1}
              className="w-[120px]"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="code-blocks">Include Code Blocks</Label>
            <Switch 
              id="code-blocks" 
              checked={settings.includeCodeBlocks}
              onCheckedChange={(checked) => onSettingsChange({ ...settings, includeCodeBlocks: checked })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="navigation">Exclude Navigation</Label>
            <Switch 
              id="navigation" 
              checked={settings.excludeNavigation}
              onCheckedChange={(checked) => onSettingsChange({ ...settings, excludeNavigation: checked })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="external-links">Follow External Links</Label>
            <Switch 
              id="external-links" 
              checked={settings.followExternalLinks}
              onCheckedChange={(checked) => onSettingsChange({ ...settings, followExternalLinks: checked })}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
