import Link from "next/link";

export default function NotFound() {
  return (
    <div className="product-empty">
      <h1>Product not found.</h1>
      <p>The product link may be incorrect.</p>
      <Link href="/v1/catalog">Back to catalog</Link>
    </div>
  );
}
