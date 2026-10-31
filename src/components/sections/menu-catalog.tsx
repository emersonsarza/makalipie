"use client";
import { VisibleBranches } from "@/components/customer-policy";
import { usePublicShop, ChatLinks } from "@/components/public-shop-provider";
import { FlippingMenuListings } from "@/components/sections/flipping-menu-listings";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Fragment, useRef } from "react";
import { MobileMenuCategories } from "@/components/sections/mobile-menu-categories";
import { groupBySection, type MenuSection } from "@/lib/catalog/sections";
import { menuSizes } from "@/lib/catalog/menu-view";
import { itemPriceText, type MenuItem } from "@/lib/site";

function PieCard({ item }: { item: MenuItem }) {
  return (
    <article id={item.slug} className="catalog-item">
      <Link
        href="/order"
        className="catalog-photo"
        aria-label={`Order ${item.name}`}
      >
        <Image
          key={item.image.src}
          src={item.image.src}
          unoptimized
          loading="eager"
          alt={item.image.alt}
          fill
          sizes="(max-width: 767px) 45vw, (max-width: 1099px) 30vw, 23vw"
        />
        <span className="catalog-photo-action">
          <ArrowUpRight size={21} aria-hidden />
        </span>
      </Link>
      <div className="catalog-title">
        <h3>
          <Link href="/order">{item.name}</Link>
        </h3>
        <span>{itemPriceText(item)}</span>
      </div>
      <p className="catalog-description">{item.description}</p>
    </article>
  );
}

export function MenuCatalog({
  items: menuItems,
  unavailable = false,
  sections = [],
  preorder = false,
}: {
  items: MenuItem[];
  unavailable?: boolean;
  sections?: MenuSection[];
  preorder?: boolean;
}) {
  const shop = usePublicShop();
  const listingsRef = useRef<HTMLDivElement>(null);
  const sized = menuSizes(menuItems, preorder);
  const grouped = groupBySection(sized, sections);
  const groups = [
    ...grouped.groups,
    ...(grouped.unassigned.length
      ? [
          {
            section: {
              id: "unassigned",
              name: "More pies",
              note: "",
              sortOrder: 9999,
            } as MenuSection,
            items: grouped.unassigned,
          },
        ]
      : []),
  ];
  return (
    <div className="menu-page menu-catalog-page">
      <section className="menu-intro wrap">
        <div>
          <p className="eyebrow hero-enter">THE MAKALIPIE MENU</p>
          <h1 className="hero-enter hero-delay-1">
            A little of
            <br />
            what makes you <span>happy.</span>
          </h1>
          <p className="hero-enter hero-delay-2">
            Something bright. Something chocolatey.
            <br />
            Always a crust worth saving the last bite for.
          </p>
        </div>
        <div className="menu-intro-photo hero-enter hero-delay-2">
          <Image
            src="/images/brand/gift.webp"
            alt="A box of four Makalipie tarts on a wooden table"
            fill
            priority
            sizes="(max-width: 767px) 100vw, 40vw"
          />
        </div>
      </section>
      <div className="menu-toolbar">
        <div className="menu-toolbar-bar wrap">
          <div className="menu-toolbar-navs w-full flex items-center justify-between">
            {!!groups.length && (
              <nav
                className="menu-categories"
                aria-label={`${preorder ? "Pre-order" : "Menu"} categories`}
              >
                {groups.map(({ section }, index) => (
                  <Fragment key={section.id}>
                    {index > 0 && <span aria-hidden="true">|</span>}
                    <a href={`#menu-${section.id}`}>{section.name}</a>
                  </Fragment>
                ))}
              </nav>
            )}
          </div>
        </div>
      </div>
      <div ref={listingsRef} className="menu-listing-region" data-has-categories={groups.length ? "" : undefined}>
      <FlippingMenuListings view={preorder ? "preorder" : "regular"} imageSources={sized.map(item => item.image.src)}>
        {groups.length ? (
          groups.map(({ section, items }) => (
            <section
              key={section.id}
              id={`menu-${section.id}`}
              className="menu-classics wrap section-space"
            >
              <div className="section-heading">
                <div>
                  <h2 tabIndex={-1}>{section.name}</h2>
                </div>
                {section.note && (
                  <p className="menu-section-note">{section.note}</p>
                )}
              </div>
              <div className="catalog-grid">
                {items.map((item) => (
                  <PieCard key={item.slug} item={item} />
                ))}
              </div>
            </section>
          ))
        ) : (
          <section className="wrap section-space" role="status">
            <h2>
              {unavailable
                ? "Our menu is temporarily unavailable."
                : preorder
                  ? "No pre-orders are listed right now."
                  : "No regular pies are listed right now."}
            </h2>
            <p>
              {unavailable
                ? "Please check back soon, or contact us for help."
                : "Browse the other menu or contact us for availability."}{" "}
              <ChatLinks />
            </p>
          </section>
        )}
      </FlippingMenuListings>
      </div>
      <MobileMenuCategories preorder={preorder} key={preorder ? "preorder" : "regular"} categories={groups.map(({ section }) => ({ id: section.id, name: section.name }))} regionRef={listingsRef} />
      <section className="menu-order-note wrap section-space">
        <div>
          <p className="eyebrow">FROM OUR KITCHEN TO YOUR TABLE</p>
          <h2>Picked your favourites?</h2>
          <p>
            Choose a branch and date, then copy your order and send it through <ChatLinks /> so we can confirm the details.
          </p>
          <Link href="/order" className="brand-button">
            Put together your order <ArrowUpRight size={18} aria-hidden />
          </Link>
        </div>
        <div className="menu-order-details">
          <div>
            <span>Prefer Grab or Foodpanda?</span>
            <p>
              Open our store in the app. Prices, delivery fees, and availability
              are set on the platform.
            </p>
            <div className="delivery-app-actions">
              <a
                href={shop.links.grabFood}
                target="_blank"
                rel="noreferrer"
                className="brand-button outline-button"
              >
                Order on Grab <ArrowUpRight size={16} aria-hidden />
              </a>
              <a
                href={shop.links.foodpanda}
                target="_blank"
                rel="noreferrer"
                className="brand-button outline-button"
              >
                Order on Foodpanda <ArrowUpRight size={16} aria-hidden />
              </a>
            </div>
          </div>
          <div>
            <span>Taking it home</span>
            <VisibleBranches />
          </div>
          <div>
            <span>Sending a little happiness</span>
            <p>
              {shop.deliveryAvailable
                ? "In Cebu, choose pickup or delivery. We book the rider, and you pay the delivery fee with your order or directly to the driver."
                : "Delivery is not currently offered."}{" "}
              You can also book your own courier; choose Pickup. Manila, when offered, is pickup only.
              <br />
              Use the pickup address shown on the order form.
            </p>
          </div>
          <div>
            <span>Something we should know?</span>
            <p>
              Our kitchen also handles nuts and gluten, so cross-contact is possible. For allergies or dietary questions,{" "}
              <a href={shop.links.instagramDm} target="_blank" rel="noreferrer">
                talk to us
              </a>{" "}
              before you send your order.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
