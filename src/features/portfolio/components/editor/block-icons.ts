import { Columns2, Heading, Image as ImageIcon, Images, LayoutGrid, Minus, MousePointerClick, Quote, Star, Type, type LucideIcon } from "lucide-react"
import type { PortfolioBlockType } from "../../blocks"

/** Ícone de cada tipo de bloco (biblioteca, árvore e "+"). */
export const BLOCK_ICONS: Record<PortfolioBlockType, LucideIcon> = {
    heading: Heading,
    text: Type,
    image: ImageIcon,
    gallery: Images,
    button: MousePointerClick,
    testimonial: Quote,
    separator: Minus,
    columns: Columns2,
    section: LayoutGrid,
    featured: Star,
}
