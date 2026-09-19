import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, MapPin } from "lucide-react";
import { InstagramIcon } from "@/components/icons";
import { PieSelection } from "@/components/sections/pie-selection";
import { Reveal } from "@/components/reveal";
import { SiteShell } from "@/components/site-shell";
import { site } from "@/lib/site";

export default function Home() {
  return (
    <SiteShell>
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
      <PieSelection />
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
              That’s where our name comes from. And why we make pies small
              enough for an ordinary Tuesday, and good enough for a celebration.
            </p>
            <p>
              Every crust is hand-rolled, pressed one by one, and blind-baked. A
              little patience you can taste in the first bite.
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
                Sunday market regular? Look out for our
                <br />
                Butter Chicken Curry pie, around 7am to 3pm.
              </p>
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
              Yes. Select Lalamove delivery in the order form and add your
              address. We’ll coordinate the booking and confirm the delivery fee
              with you. You can also pick up at Streetscape.
            </p>
          </details>
          <details>
            <summary>When can I get Buko pie?</summary>
            <p>
              Our Buko pie is available Friday to Sunday.{" "}
              <a href={site.instagramDmUrl} target="_blank" rel="noreferrer">
                Message us on Instagram
              </a>{" "}
              to check the weekend batch and reserve yours.
            </p>
          </details>
          <details>
            <summary>What about gifts and bigger gatherings?</summary>
            <p>
              Add a note card or birthday topper in the order form. For
              corporate gifts, dessert tables, and custom requests, send us a
              message on Instagram and we’ll talk through the details.
            </p>
          </details>
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
