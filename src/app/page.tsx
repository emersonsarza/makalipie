import { readPublicMenu } from "@/lib/products/public";
import { manilaDate } from "@/lib/catalog/rules";
import { openPopups, popupDateRange } from "@/lib/popups/schema";
import { readPopupSettings } from "@/lib/popups/store";
export const dynamic = "force-dynamic";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, MapPin } from "lucide-react";
import { InstagramIcon } from "@/components/icons";
import { PieSelection } from "@/components/sections/pie-selection";
import { Reveal } from "@/components/reveal";
import { SiteShell } from "@/components/site-shell";
import { getSiteUrl, site } from "@/lib/site";

export default async function Home() {
  const [{ items }, popups] = await Promise.all([
    readPublicMenu(),
    readPopupSettings().then((settings) => openPopups(settings.listings, manilaDate())),
  ]);
  return (
    <SiteShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            "@id": `${getSiteUrl()}/#website`,
            name: site.name,
            url: `${getSiteUrl()}/`,
            inLanguage: "en-PH",
            publisher: { "@id": `${getSiteUrl()}/#bakery` },
          }).replace(/</g, "\\u003c"),
        }}
      />
      <section className="home-hero wrap">
        <div className="hero-copy">
          <p className="eyebrow hero-enter">CEBU’S HOME FOR TARTS & PIES</p>
          <h1 className="hero-enter hero-delay-1">
            A little pie.
            <br />A lot of <span>happy.</span>
          </h1>
          <p className="hero-description hero-enter hero-delay-2">
            Hand-rolled crust. Generous fillings.
            <br />
            Small, everyday reasons to make someone’s day.
          </p>
          <div className="hero-actions hero-enter hero-delay-3">
            <Link href="/menu" className="brand-button">
              Find your favourite <ArrowUpRight size={19} aria-hidden />
            </Link>
            <Link href="/#story" className="text-link">
              A little about us <ArrowRight size={17} aria-hidden />
            </Link>
          </div>
          <div className="hero-footnote">
            <span>Sweet & savoury</span>
            <span>Handmade in Cebu since 2020</span>
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-photo">
            <Image
              src="/images/brand/hero.webp"
              alt="A hand reaches for a key lime tart among pecan, chocolate and cream tarts on a warm wooden table"
              fill
              priority
              sizes="(max-width: 767px) 100vw, 55vw"
            />
          </div>
          <div className="hero-photo-caption">
            <span>A seat at our table.</span>
            <span>There’s always room for pie.</span>
          </div>
        </div>
      </section>
      <PieSelection items={items} />
      <section id="story" className="story-section section-space">
        <div className="wrap story-layout">
          <Reveal className="story-photos">
            <div className="story-main-photo">
              <Image
                src="/images/brand/maker.webp"
                alt="A Makalipie baker finishing individual tarts by hand"
                fill
                sizes="(max-width: 767px) 80vw, 35vw"
              />
            </div>
            <div className="story-detail-photo">
              <Image
                src="/images/brand/hands.webp"
                alt="Chocolate being grated over a tray of handmade banoffee tarts"
                fill
                sizes="(max-width: 767px) 40vw, 21vw"
              />
            </div>
          </Reveal>
          <Reveal className="story-copy">
            <p className="eyebrow">A CEBUANO WORD. A SIMPLE IDEA.</p>
            <h2>
              From <em>makalipay.</em>
              <br />
              To make you happy.
            </h2>
            <p>
              Back home in Cebu after working in Sydney, chef Dominika Miranda started with a simple craving for mango pie. What began as baking for herself soon became something she wanted to share.
            </p>
            <p>
              When it came time to give it a name, her brother suggested Makalipie—a playful take on makalipay, the Cebuano word for “to make someone happy.” It captured exactly what she wanted the brand to be about: good food, made with care, that brings a little happiness to someone’s day.
            </p>
            <p>
              What started with one pie has since grown into a collection of handcrafted tarts, flaky pies, and familiar flavors made the Makalipie way.
            </p>
            <p>
              Everything is still made in small batches—hand-rolled, pressed one by one, and shared at tables, celebrations, coffee dates, or simply because you felt like having pie.
            </p>
            <p>
              Because at the heart of Makalipie is still that same simple idea: to make you happy.
            </p>
            <div className="story-signoff">
              <Image
                src="/brand/seal.png"
                alt="Makalipie original seal, established 2020"
                width={82}
                height={82}
              />
              <span>
                Small-batch. Cebuana-made.
                <br />
                <strong>Makalipie gyud ni.</strong>
              </span>
            </div>
          </Reveal>
        </div>
      </section>
      <section className="gift-section wrap section-space">
        <Reveal className="gift-layout">
          <div className="gift-copy">
            <p className="eyebrow">SOME THINGS ARE BETTER SHARED</p>
            <h2>
              “I brought
              <br />
              you a little
              <br />
              <span>something.”</span>
            </h2>
            <p>
              A thank-you. A birthday. Sunday lunch.
              <br />A box of pies says it pretty well.
            </p>
            <Link href="/order" className="brand-button">
              Put together a box <ArrowUpRight size={18} aria-hidden />
            </Link>
            <a
              href={site.instagramDmUrl}
              target="_blank"
              rel="noreferrer"
              className="gift-custom"
            >
              Planning something bigger? Let’s talk{" "}
              <ArrowUpRight size={15} aria-hidden />
            </a>
          </div>
          <div className="gift-photo">
            <Image
              src="/images/brand/gift.webp"
              alt="An open gift box of Makalipie tarts, ready to share"
              fill
              sizes="(max-width: 767px) 100vw, 55vw"
            />
          </div>
        </Reveal>
      </section>
      <section id="visit" className="visit-section section-space">
        <div className="wrap">
          <div className="section-heading">
            <div>
              <p className="eyebrow">YOUR LITTLE PIE STOP</p>
              <h2>See you at Streetscape.</h2>
            </div>
            <a
              className="text-link"
              href={site.mapsUrl}
              target="_blank"
              rel="noreferrer"
            >
              Get directions <ArrowUpRight size={18} aria-hidden />
            </a>
          </div>
          <div className="visit-layout">
            <div className="visit-photo">
              <Image
                src="/images/brand/table.webp"
                alt="Makalipie tarts on an outdoor café table surrounded by greenery"
                fill
                sizes="(max-width: 767px) 100vw, 55vw"
              />
            </div>
            <div className="visit-details">
              <MapPin size={28} strokeWidth={1.4} aria-hidden />
              <h3>
                Come for a pie.
                <br />
                Stay for a little while.
              </h3>
              <p>
                2nd Floor, Streetscape
                <br />
                Banilad, Cebu City
              </p>
              <div className="opening-hours">
                <span>Monday to Sunday</span>
                <strong>10am to 8pm</strong>
              </div>
              <a
                href={site.mapsUrl}
                target="_blank"
                rel="noreferrer"
                className="brand-button outline-button"
              >
                Find your way here <ArrowUpRight size={18} aria-hidden />
              </a>
              <p className="visit-market">
                Catch us at local pop-ups, too. Check Instagram for the next
                market, seasonal pie, or special drop.
              </p>
              {popups.length > 0 ? (
                <ul className="visit-popups">
                  {popups.map((popup) => (
                    <li key={popup.id} className="visit-popup">
                      <p className="visit-popup-name">{popup.name}</p>
                      <p>{popup.address}</p>
                      <p>{popupDateRange(popup.startDate, popup.endDate)}</p>
                      <p>{popup.hours}</p>
                      <ul className="visit-popup-items">
                        {popup.items.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                      {popup.mapUrl ? (
                        <a href={popup.mapUrl} target="_blank" rel="noreferrer">
                          Directions <ArrowUpRight size={14} aria-hidden />
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </div>
      </section>
      <section className="faq-section wrap section-space">
        <div>
          <p className="eyebrow">BEFORE YOUR FIRST BITE</p>
          <h2>
            A few little
            <br />
            things to know.
          </h2>
        </div>
        <div className="faq-list">
          <details>
            <summary>How do I order a box?</summary>
            <p>
              Choose your pies in our <Link href="/order">order form</Link>,
              copy your order summary, and send it to us on Instagram. We’ll
              confirm availability and send your invoice before payment.
            </p>
          </details>
          <details>
            <summary>Can I have my pies delivered?</summary>
            <p>
              Yes! We can arrange delivery within Cebu City. Delivery fees are
              shouldered by the buyer.
            </p>
            <div className="delivery-app-actions">
              <a
                href={site.grabUrl}
                target="_blank"
                rel="noreferrer"
                className="brand-button outline-button"
              >
                Order on Grab <ArrowUpRight size={16} aria-hidden />
              </a>
              <a
                href={site.foodpandaUrl}
                target="_blank"
                rel="noreferrer"
                className="brand-button outline-button"
              >
                Order on Foodpanda <ArrowUpRight size={16} aria-hidden />
              </a>
            </div>
          </details>
          <details>
            <summary>When is Buko Makalipie available?</summary>
            <p>
              Our famous Buko Makalipie is part of our flaky crust lineup, freshly baked every Friday, Saturday, and Sunday. Pre-orders are always welcome!
            </p>
          </details>
          <details>
            <summary>Do you deliver to Manila?</summary>
            <p>
              We do occasional Makalipie drops in Manila! We announce upcoming dates and open pre-order slots through our Instagram, so stay tuned.
            </p>
          </details>
          <details>
            <summary>How long do the pies last?</summary>
            <p>
              Our pies are best enjoyed on the day they’re baked—they’re pastries, after all! For later enjoyment, keep them chilled and consume within 5 days.
            </p>
          </details>
          <details>
            <summary>Do you offer bigger pies for gatherings?</summary>
            <p>
              Coming soon! We’ll be launching a menu for our 10-inch pie selection. And for even bigger gatherings, stay tuned for our future catering packages. 🥧
            </p>
          </details>
        </div>
      </section>
      <section className="press-section wrap">
        <div className="section-heading">
          <div>
            <p className="eyebrow">A LITTLE MORE OF OUR STORY</p>
            <h2>Beyond the pie box.</h2>
          </div>
        </div>
        <div className="press-links">
          <a
            href="https://www.instagram.com/makalipie/p/DdNwqSvD4kd/"
            target="_blank"
            rel="noreferrer"
          >
            <span className="eyebrow">THE DAILY DISH · SEPTEMBER 2026</span>
            <h3>A Makalipie moment on screen.</h3>
            <p>Our announcement of a feature on Bilyonaryo News Channel.</p>
            <span>
              See the post <ArrowUpRight size={17} aria-hidden />
            </span>
          </a>
          <a
            href="https://www.instagram.com/featrmedia/reel/DX3xVJFNsmH/"
            target="_blank"
            rel="noreferrer"
          >
            <span className="eyebrow">FEATR</span>
            <h3>Inside our Buko pie.</h3>
            <p>A closer look at our homemade French butter crust.</p>
            <span>
              Watch the feature <ArrowUpRight size={17} aria-hidden />
            </span>
          </a>
          <a
            href="https://keeta.ph/how-makalipie-redefined-happiness/"
            target="_blank"
            rel="noreferrer"
          >
            <span className="eyebrow">KEETA</span>
            <h3>How it all began.</h3>
            <p>Meet chef Dominika Miranda and the idea behind Makalipie.</p>
            <span>
              Read the story <ArrowUpRight size={17} aria-hidden />
            </span>
          </a>
        </div>
      </section>
      <section className="social-section wrap">
        <div>
          <InstagramIcon className="size-5" />
          <span>A little more pie in your feed.</span>
        </div>
        <a href={site.instagramUrl} target="_blank" rel="noreferrer">
          @makalipie <ArrowUpRight size={18} aria-hidden />
        </a>
      </section>
    </SiteShell>
  );
}
