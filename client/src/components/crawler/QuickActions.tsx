import { Button } from "@/components/ui/button"
import { motion } from "framer-motion"

interface QuickActionsProps {
  onSelect: (url: string) => void
  isLoading: boolean
}

export function QuickActions({ onSelect, isLoading }: QuickActionsProps) {
  if (isLoading) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="flex gap-2 justify-center mt-4"
    >
      <Button 
        variant="outline" 
        className="rounded-full text-sm"
        onClick={() => onSelect("https://react.dev/reference/react")}
      >
        Crawl React documentation →
      </Button>
      <Button 
        variant="outline" 
        className="rounded-full text-sm"
        onClick={() => onSelect("https://nextjs.org/docs")}
      >
        Extract Next.js API docs →
      </Button>
      <Button 
        variant="outline" 
        className="rounded-full text-sm"
        onClick={() => onSelect("https://tailwindcss.com/docs/installation")}
      >
        Get Tailwind CSS examples →
      </Button>
    </motion.div>
  )
}
