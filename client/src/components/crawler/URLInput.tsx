import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Link2, ArrowRight, Loader2 } from "lucide-react"
import { SettingsDialog } from "./SettingsDialog"
import { motion } from "framer-motion"

interface URLInputProps {
  url: string
  isLoading: boolean
  onUrlChange: (url: string) => void
  onSubmit: () => void
  settings?: {
    maxDepth: number
    includeCodeBlocks: boolean
    excludeNavigation: boolean
    followExternalLinks: boolean
  }
  onSettingsChange?: (settings: URLInputProps['settings']) => void
}

export function URLInput({ url, isLoading, onUrlChange, onSubmit, settings, onSettingsChange }: URLInputProps) {
  return (
    <motion.form 
      className="relative"
      animate={{ 
        y: isLoading ? 20 : 0 
      }}
      transition={{ type: "spring", stiffness: 100, damping: 20 }}
      style={{ 
        position: 'relative',
        zIndex: 50
      }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!url || isLoading) return;
        onSubmit();
      }}
    >
      <div className="relative flex items-center max-w-3xl mx-auto">
        <div className="relative flex-1">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <Link2 className="w-5 h-5 text-muted-foreground" />
          </div>
          <Input
            placeholder="Enter documentation URL (e.g. https://docs.example.com)"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            className="pl-12 pr-[160px] h-14 text-lg rounded-2xl border-2 hover:border-primary/50 transition-colors"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (!url || isLoading) return;
                onSubmit();
              }
            }}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {onSettingsChange && settings && (
              <SettingsDialog 
                settings={settings} 
                onSettingsChange={onSettingsChange} 
              />
            )}
            <Button 
              type="submit"
              disabled={!url || isLoading}
              size="sm"
              className="rounded-xl"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Crawling...
                </span>
              ) : (
                <>
                  Crawl
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </motion.form>
  )
}
