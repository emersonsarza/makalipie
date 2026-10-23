"use client";
import { usePublicShop, ChatLinks } from "@/components/public-shop-provider";
import { CatalogDetails } from "@/components/catalog-details";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { itemPriceText, site, type MenuItem } from "@/lib/site";

export function MenuCatalog({ items: menuItems, unavailable = false }: { items: MenuItem[]; unavailable?: boolean }) {
  const shop = usePublicShop();
  const classics = menuItems.filter(
    (item) => item.kind === "sweet" && item.slug !== "buko",
  );
  const special = menuItems.filter((item) => item.kind === "savory" || item.slug === "buko");
  return (
    <div className="menu-page">
      <section className="menu-intro wrap">
        <div>
          <p className="eyebrow">THE MAKALIPIE MENU</p>
          <h1>
            A little of
            <br />
            what makes you <span>happy.</span>
          </h1>
          <p>
            Something bright. Something chocolatey.
            <br />
            Always a crust worth saving the last bite for.
          </p>
        </div>
        <div className="menu-intro-photo">
          <Image
            src="/images/brand/gift.webp"
            alt="A box of four Makalipie tarts on a wooden table"
            fill
            priority
            sizes="(max-width: 767px) 100vw, 40vw"
          />
        </div>
      </section>
      <nav className="menu-jump wrap" aria-label="Menu categories">
        <div>
          <a href="#sweet-tarts">
            Sweet tarts <span>{classics.length}</span>
          </a>
          <a href="#weekend-pies">
            Weekend & savoury <span>{special.length}</span>
          </a>
        </div>
        <Link href="/order">
          Put together a box <ArrowUpRight size={17} aria-hidden />
        </Link>
      </nav>
      <section id="sweet-tarts" className="menu-classics wrap section-space">
        <div className="section-heading">
          <div>
            <p className="eyebrow">FOR THE EVERYDAY LITTLE TREAT</p>
            <h2>Sweet by nature.</h2>
          </div>
          <p className="menu-section-note">
            Hand-rolled. Pressed one by one.
            <br />
            Made to make your day.
          </p>
        </div>
        {!menuItems.length && <p role="status">{unavailable ? "Our menu is temporarily unavailable. Please message us on Instagram for help." : "Our menu is being updated. Please check back soon."}</p>}
        <div className="catalog-grid">
          {classics.map((item) => (
            <article id={item.slug} key={item.slug} className="catalog-item">
              <Link
                href="/order"
                className="catalog-photo"
                aria-label={`Order ${item.name}`}
              >
                <Image
                  src={item.image.src}
                  unoptimized
                  alt={item.image.alt}
                  fill
                  sizes="(max-width: 600px) 100vw, (max-width: 1000px) 45vw, 30vw"
                />
                <span className="catalog-photo-action">
                  <ArrowUpRight size={21} aria-hidden />
                </span>
              </Link>
              <div className="catalog-title">
                <h3>{item.name}</h3>
                <span>
                  {itemPriceText(item)}
                  
                </span>
              </div>
              <p>{item.description}</p><CatalogDetails item={item} />
              {item.note && <p>{item.note}</p>}
              {!!item.allergens?.length && <p>Contains: {item.allergens.join(", ")}.</p>}
              <Link href="/order" className="catalog-order">
                Go to order form <ArrowRight size={15} aria-hidden />
              </Link>
            </article>
          ))}
          <div className="catalog-gift">
            <Image
              src="/brand/seal.png"
              alt="Makalipie original seal"
              width={100}
              height={100}
            />
            <p className="eyebrow">A LITTLE OF EVERYTHING</p>
            <h3>
              Can’t pick
              <br />
              just one?
            </h3>
            <p>
              Mix your favourites into a box.
              <br />
              One for you. A few to share.
            </p>
            <Link href="/order" className="brand-button">
              Make it a box <ArrowUpRight size={18} aria-hidden />
            </Link>
          </div>
        </div>
      </section>
      {special.length > 0 && <section id="weekend-pies" className="menu-weekend">
        <div className="wrap section-space">
          <div className="section-heading">
            <div>
              <p className="eyebrow">SOMETHING TO LOOK FORWARD TO</p>
              <h2>A little sweet. A little savoury.</h2>
            </div>
            <p className="menu-section-note">
              A different rhythm.
              <br />
              The same care in every crust.
            </p>
          </div>
          <div className="weekend-grid">
            {special.map((item) => <article id={item.slug} key={item.slug} className="weekend-savory">
              <Image src={item.image.src} alt={item.image.alt} unoptimized width={480} height={320} style={{ width: "100%", height: 220, objectFit: "cover", borderRadius: 12, marginBottom: 24 }} />
              <p className="eyebrow">{item.kind === "sweet" ? "SOMETHING SWEET" : "SOMETHING HEARTY"}</p>
              <h3>{item.name}</h3><p>{item.description}</p><CatalogDetails item={item} />
              {item.note && <p>{item.note}</p>}
              {!!item.allergens?.length && <p>Contains: {item.allergens.join(", ")}.</p>}
              <a href={shop.links.instagramDm} target="_blank" rel="noreferrer" className="brand-button">Ask about this pie <ArrowUpRight size={18} aria-hidden /></a>
              <span className="weekend-price">{itemPriceText(item)}</span>
            </article>)}
          </div>
        </div>
      </section>
      }
      <section className="menu-seasonal wrap">
        <div>
          <p className="eyebrow">THERE’S MORE IN THE KITCHEN</p>
          <h2>Keep an eye on the next batch.</h2>
          <p>
            Apple Makalipie joined our recent Manila drop. Seasonal flavours and
            special drops are announced on Instagram; ask us what’s baking
            before you order.
          </p>
        </div>
        <a
          href={shop.links.instagram}
          target="_blank"
          rel="noreferrer"
          className="text-link"
        >
          See the latest from our kitchen <ArrowUpRight size={18} aria-hidden />
        </a>
      </section>
      <section className="menu-order-note wrap section-space">
        <div>
          <p className="eyebrow">FROM OUR KITCHEN TO YOUR TABLE</p>
          <h2>Picked your favourites?</h2>
          <p>
            Choose a branch and date to see which pies are available. Send your order number through <ChatLinks /> so we can confirm the details.
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
            <p>
              {shop.address}
              <br />
              {shop.hoursLabel}
            </p>
          </div>
          <div>
            <span>Sending a little happiness</span>
            <p>
              {shop.deliveryAvailable ? "Choose bakery-booked delivery where offered, with the fee confirmed in chat." : "Delivery is not currently offered."} You can also book your own courier; choose Pickup.
              <br />
              Use the pickup address shown on your order page.
            </p>
          </div>
          <div>
            <span>Something we should know?</span>
            <p>
              For allergies or dietary questions,{" "}
              <a href={shop.links.instagramDm} target="_blank" rel="noreferrer">
                talk to us
              </a>{" "}
              before placing your order.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
