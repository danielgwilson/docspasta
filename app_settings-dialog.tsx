'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Settings } from 'lucide-react'

interface CrawlerSettings {
  maxDepth: number
  includeCodeBlocks: boolean
  excludeNavigation: boolean
  followExternalLinks: boolean
}

interface SettingsDialogProps {
  settings: CrawlerSettings
  onSettingsChange: (settings: CrawlerSettings) => void
}

export function SettingsDialog({ settings, onSettingsChange }: SettingsDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="rounded-xl">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Crawler Settings</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="maxDepth">Maximum Crawl Depth</Label>
            <Input
              id="maxDepth"
              type="number"
              value={settings.maxDepth}
              onChange={(e) => onSettingsChange({
                ...settings,
                maxDepth: parseInt(e.target.value)
              })}
              className="rounded-xl"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="includeCode">Include Code Blocks</Label>
            <Switch
              id="includeCode"
              checked={settings.includeCodeBlocks}
              onCheckedChange={(checked) => onSettingsChange({
                ...settings,
                includeCodeBlocks: checked
              })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="excludeNav">Exclude Navigation Elements</Label>
            <Switch
              id="excludeNav"
              checked={settings.excludeNavigation}
              onCheckedChange={(checked) => onSettingsChange({
                ...settings,
                excludeNavigation: checked
              })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="followExternal">Follow External Links</Label>
            <Switch
              id="followExternal"
              checked={settings.followExternalLinks}
              onCheckedChange={(checked) => onSettingsChange({
                ...settings,
                followExternalLinks: checked
              })}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

