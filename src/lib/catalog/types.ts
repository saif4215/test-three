/** Shapes shared by the shop pages and the components. Safe to import in the browser. */
export interface CardImage {
  id: string;
  storage_key: string;
  widths: number[];
  width: number;
  height: number;
  alt: string;
  kind?: string;
}

export interface ProductCard {
  id: string;
  slug: string;
  name: string;
  short_description: string;
  category_name: string | null;
  /** The lowest price a customer can pay for any option. */
  effective_price_cents: number;
  /** Shown struck through when the lowest price is a sale price. */
  original_price_cents: number | null;
  in_stock: boolean;
  color_count: number;
  image: CardImage | null;
  image_hover: CardImage | null;
  featured: boolean;
  is_new: boolean;
}

export interface VariantPublic {
  id: string;
  size: string;
  color: string;
  unit_price_cents: number;
  original_price_cents: number | null;
  on_sale: boolean;
  available: boolean;
  /** When stock is running low: how many are left (never shown otherwise). */
  low_stock_count: number | null;
}

export interface ProductImagePublic extends CardImage {
  color: string;
}

export interface ProductDetail {
  id: string;
  slug: string;
  name: string;
  short_description: string;
  description_md: string;
  instructions_md: string;
  size_chart_md: string;
  status: "draft" | "published" | "archived";
  sku: string;
  tags: string[];
  featured: boolean;
  is_new: boolean;
  categories: { id: string; name: string; slug: string }[];
  images: ProductImagePublic[];
  variants: VariantPublic[];
  sizes: string[];
  colors: string[];
}

export interface PublicCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  show_on_home: boolean;
  product_count: number;
  image: CardImage | null;
}

export type SortKey = "featured" | "newest" | "price_asc" | "price_desc" | "name";
export const SORT_LABELS: Record<SortKey, string> = {
  featured: "Featured",
  newest: "Newest",
  price_asc: "Price: Low to High",
  price_desc: "Price: High to Low",
  name: "Name: A to Z",
};

export interface ProductFilters {
  q?: string;
  category?: string;
  size?: string;
  color?: string;
  minCents?: number;
  maxCents?: number;
  inStock?: boolean;
  onSale?: boolean;
  sort?: SortKey;
  page?: number;
  pageSize?: number;
}

export interface ProductList {
  items: ProductCard[];
  total: number;
  page: number;
  pageCount: number;
}

export interface Facets {
  sizes: string[];
  colors: string[];
  minCents: number;
  maxCents: number;
}
