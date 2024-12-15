import { Button } from "@/components/ui/button"
import { motion } from "framer-motion"

interface QuickActionsProps {
  onSelect: (url: string) => void
  isLoading: boolean
}

interface QuickActionProps {
  title: string
  url: string
}

const QUICK_ACTIONS_CONFIG = [
  {
    title: "React",
    url: "https://react.dev/reference/react",
  },
  {
    title: "Next.js",
    url: "https://nextjs.org/docs",
  },
  {
    title: "Tailwind CSS",
    url: "https://tailwindcss.com/docs/installation",
  }
]

export function QuickActions({ onSelect, isLoading }: QuickActionsProps) {
  if (isLoading) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="flex gap-2 justify-center mt-4"
    >
      {QUICK_ACTIONS_CONFIG.map((action, i) => {
        return (
          <Button 
            key={`quickActionButton-${i}`}
            onClick={() => onSelect(action.url)}
            disabled={isLoading}
            variant="outline"
            size="sm"
            className="rounded-md"
          >
            {action.title}
          </Button>
        )
      })}
    </motion.div>
  )
}
