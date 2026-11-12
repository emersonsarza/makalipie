import type { StoreImage, StoreThemeImage, ThemeName } from "../storefront/types";

export type DropStatus = "draft" | "published" | "ended";

export type DropDate = {
  date: string;
  orderingOpens: string;
  orderingCutoff: string;
  pickupStarts: string;
  pickupEnds: string;
  dispatchStarts: string | null;
  dispatchEnds: string | null;
};

export type DropComponent = {
  productId: string;
  sizeId: string;
  quantity: number;
};

export type DropAllocation = {
  date: string;
  included: boolean;
  allocated: number;
  committed: number;
};

export type DropOffering = {
  id: string;
  kind: "size" | "package";
  name: string;
  priceCentavos: number;
  perOrderMax: number;
  productId: string | null;
  sizeId: string | null;
  sortOrder: number;
  contentsLockedAt: string | null;
  components: DropComponent[];
  dates: DropAllocation[];
};

export type DropAddon = {
  addOnId: string;
  name: string;
  priceCentavos: number;
  icon: string;
  sortOrder: number;
};

export type DropEvent = {
  id: string;
  locationId: string;
  status: DropStatus;
  name: string;
  address: string;
  mapUrl: string;
  deliveryEnabled: boolean;
  updatedAt: string;
  dates: DropDate[];
  offerings: DropOffering[];
  addons: DropAddon[];
};

export type DropStore = {
  revision: number;
  drops: DropEvent[];
};

export type DropCatalog = {
  theme: ThemeName;
  products: {
    id: string;
    name?: string;
    enabled: boolean;
    image: StoreImage;
    themeImages: StoreThemeImage[];
    sizes: {
      id: string;
      label?: string;
      enabled: boolean;
      image: StoreImage | null;
      themeImages: StoreThemeImage[];
    }[];
  }[];
};
