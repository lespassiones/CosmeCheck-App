// Upload des photos des 60 produits résolus vers Supabase Storage
// (bucket public cosmetwiki-products, préfixe catalog/<ean>.jpg), puis le
// caller met à jour catalog.image_url. Source : fichier local (projet ou
// scratchpad) si présent, sinon re-téléchargement depuis l'URL d'origine.
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const BASE = "https://rogesnduejmqpxolhbif.supabase.co";
const SERVICE = readFileSync(resolve(import.meta.dirname, "..", ".env"), "utf8")
  .split(/\r?\n/).find((l) => l.startsWith("SUPABASE_SERVICE_ROLE_KEY="))
  .split("=")[1].trim();

const SCRATCH = "C:/Users/clark/AppData/Local/Temp/claude/d--MesApps-deploy-CosmeCheck-App/fe700fd9-4996-4817-8d81-ae1f2f3c449e/scratchpad";
const PROJECT = resolve(import.meta.dirname, "..");

// ean -> URL source (incibeauty). 0887167564046 exclu (placeholder nophoto).
const SOURCES = {
  "8809789635043": "https://incibeauty.com/photos/4/3/e/43e888aa9d2cef7cc1c9ddbc226c153e.jpg",
  "8053732151955": "https://incibeauty.com/photos/4/5/a/45a1e46f6f0c6f79a1c7986a72bf1d4.jpg",
  "7891033490905": "https://incibeauty.com/photos/b/b/6/bb6585d5ad2b5508f6309e6db37d59d0.jpg",
  "8003140491532": "https://incibeauty.com/photos/c/2/c/c2cf9c2776b694b2f9e5b8b3a15111.jpg",
  "4049639426269": "https://incibeauty.com/photos/6/a/3/6a343d7444dd54443144c8ed77c4a68.jpg",
  "0840026675840": "https://incibeauty.com/photos/1/8/d/18dc51bfd72fb8ffcd047f4ef0fa84cd.jpg",
  "0817494017496": "https://incibeauty.com/photos/4/8/3/483107601a3dbfcfc0e4a638357bcbde.jpg",
  "0814333028101": "https://incibeauty.com/photos/2/3/2/2327189b9543740e3bdc2098ecb37e4f.jpg",
  "8056269410793": "https://incibeauty.com/photos/7/f/a/7fa87b6b76e61473da617eceeb19d4.jpg",
  "8886482915269": "https://incibeauty.com/photos/4/3/1/43113e389b96f83390288e85b22bdf1.jpg",
  "8809640735721": "https://incibeauty.com/photos/4/a/2/4a2bde404992a601e5acabf628feedef.jpg",
  "8809642719729": "https://incibeauty.com/photos/f/f/e/ffe291db94ad9cd3fdf84ad76a4fe.jpg",
  "3253581329832": "https://incibeauty.com/photos/c/2/4/c246e83e530803ed5e5cbb24556458f.jpg",
  "3387953106100": "https://incibeauty.com/photos/9/9/a/99a64c303483043a0e721f29ed16f.jpg",
  "7290116973364": "https://incibeauty.com/photos/6/5/a/65a439854edc4c0863fb3da94f65fbac.jpg",
  "3614274801958": "https://incibeauty.com/photos/5/8/b/58bc1f994617b2ee19bf9c0ba7d27381.jpg",
  "5201314069706": "https://incibeauty.com/photos/b/1/8/b189cb22f3ae8be75d8fc13ca39ae32a.jpg",
  "5201314052333": "https://incibeauty.com/photos/d/9/5/d9542185e642175ee37b3a44a650263e.jpg",
  "8402001044076": "https://incibeauty.com/photos/0/e/d/0ed73d95ac40d3817d21655854a42886.jpg",
  "0846733086856": "https://incibeauty.com/photos/e/a/7/ea71ed893c8600a560219d4cba2a609b.jpg",
  "0846733086863": "https://incibeauty.com/photos/6/1/1/6111ea8df2447e40c8b7f85b68a2b988.jpg",
  "0846733086825": "https://incibeauty.com/photos/2/9/a/29ab805f223373e994ef5f42650acff2.jpg",
  "5201279094706": "https://incibeauty.com/photos/2/d/5/2d51c8e8135af7da8eaa287c60e7a5ff.jpg",
  "6001159119425": "https://incibeauty.com/photos/9/c/8/9c87481ab0999226ea56683eef2ddf8d.jpg",
  "6291107572086": "https://incibeauty.com/photos/0/6/1/0610eaae9f4cd32ae1b63ddc9eb34394.jpg",
  "8435383508256": "https://incibeauty.com/photos/2/d/f/2df857125172fcf677adf9935e88f7a.jpg",
  "8998866108355": "https://incibeauty.com/photos/a/c/2/ac2e9a4fa516d3d15611f8147fd5e21f.jpg",
  "3660005854250": "https://incibeauty.com/photos/9/e/a/9ead83eb4b890218d060a98dc939afe1.jpg",
  "3348901500395": "https://incibeauty.com/photos/3/e/8/3e84cc3b52178044f2bac7ab89f80f51.jpg",
  "5201314107842": "https://incibeauty.com/photos/5/d/2/5d2a6546c483fc1d336174e1f36b69d.jpg",
  "0773602678716": "https://incibeauty.com/photos/1/9/3/193d5e2480e6dd2b427faff5b8e57135.jpg",
  "8684252200399": "https://incibeauty.com/photos/c/7/1/c71d3d253b1adbe9ecab98cbe6f5ac7.jpg",
  "0885190822140": "https://incibeauty.com/photos/7/b/f/7bfb5eaad0b2e8257d1a90b9364d0f7.jpg",
  "0852665002079": "https://incibeauty.com/photos/0/2/3/023893d47f40e4f5d9ae545e04b74d41.jpg",
  "8009518312102": "https://incibeauty.com/photos/9/4/f/94fdae27a8c7197ed378b7fcb09243a0.jpg",
  "8591113042442": "https://incibeauty.com/photos/3/8/5/3850abba32f51c310cb825144d412ac.jpg",
  "3348901527002": "https://incibeauty.com/photos/1/d/0/1d02f3acff7ee8c52a07aecda7f5857f.jpg",
  "8429525112982": "https://incibeauty.com/photos/5/c/1/5c1a6898c7d95b14383496a37d65cc6.jpg",
  "5901887030720": "https://incibeauty.com/photos/d/f/3/df365543f9965e9fb0f263ef9d147ccf.jpg",
  "8684252200375": "https://incibeauty.com/photos/9/9/7/997eb45d14418926fcdf936202c7ce4d.jpg",
  "3348900009868": "https://incibeauty.com/photos/2/b/e/2bed76725a3a3b974b3a69a62cd92b.jpg",
  "4051424560003": "https://incibeauty.com/photos/9/3/b/93b0f42af4863f358750e852ff7d5f15.jpg",
  "4061459319019": "https://incibeauty.com/photos/1/1/8/118f3e233b6c11063a2b905774937785.jpg",
  "0840044700319": "https://incibeauty.com/photos/3/0/6/3063aba1f13d8e29f8f58900e048c98b.jpg",
  "8025272649407": "https://incibeauty.com/photos/d/2/d/d2d6fd388c7b1e9cff4f7ff6c73994ea.jpg",
  "5904879005584": "https://incibeauty.com/photos/8/9/9/899a5086ae96effd823952ab27349f.jpg",
  "8714100863459": "https://incibeauty.com/photos/8/4/3/8438278cd687f41d26863829844332bb.jpg",
  "8990090311501": "https://incibeauty.com/photos/9/7/7/977f3e9e619e023b8d06d18471d284b.jpg",
  "5902169047726": "https://incibeauty.com/photos/4/8/b/48b674dea5f1bf51260e373e685da909.jpg",
  "6001087012263": "https://incibeauty.com/photos/1/2/a/12a3418df5f21a11ed5ebc5c9978431b.jpg",
  "8722700848707": "https://incibeauty.com/photos/b/9/a/b9ac8eb1618d9b4dd77594dd5b343adb.jpg",
  "8006540314159": "https://incibeauty.com/photos/b/b/e/bbe8f5e86df182b8974ccac210393630.jpg",
  "0846733041411": "https://incibeauty.com/photos/c/4/8/c4841717c69b29d366d068fa1b6a6c.jpg",
  "3529314006937": "https://incibeauty.com/photos/5/b/4/5b49834ee02f3fd714b0847bf6b053fa.jpg",
  "0809280149641": "https://incibeauty.com/photos/6/d/9/6d98f134641fba815ca3fbcb191fd250.jpg",
  "7898610373736": "https://incibeauty.com/photos/5/5/9/559c154766625ae7adfe28ef77fab253.jpg",
  "8025272580359": "https://incibeauty.com/photos/c/8/a/c8a8aa74509581dbe68c994229dbfcf.jpg",
  "3600541888975": "https://incibeauty.com/photos/6/8/7/687e4dc454e93865e58e23910d12634.jpg",
  "8901248478267": "https://incibeauty.com/photos/d/e/b/deb872422343871be80b93e55503cdc4.jpg",
};

const ok = [];
const ko = [];
for (const [ean, src] of Object.entries(SOURCES)) {
  try {
    let bytes = null;
    for (const p of [resolve(PROJECT, `${ean}.jpg`), resolve(SCRATCH, `${ean}.jpg`)]) {
      if (existsSync(p)) { bytes = readFileSync(p); break; }
    }
    if (!bytes || bytes.length < 2000) {
      const r = await fetch(src);
      if (!r.ok) throw new Error(`download ${r.status}`);
      bytes = Buffer.from(await r.arrayBuffer());
    }
    if (bytes.length < 2000) throw new Error("image trop petite/corrompue");
    const up = await fetch(`${BASE}/storage/v1/object/cosmetwiki-products/catalog/${ean}.jpg`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE}`,
        "Content-Type": "image/jpeg",
        "x-upsert": "true",
        "cache-control": "public, max-age=31536000",
      },
      body: bytes,
    });
    if (!up.ok) throw new Error(`upload ${up.status}: ${(await up.text()).slice(0, 120)}`);
    ok.push(ean);
    console.log(`OK  ${ean} (${Math.round(bytes.length / 1024)} kB)`);
  } catch (e) {
    ko.push(ean);
    console.log(`KO  ${ean}: ${e.message}`);
  }
}
console.log(`\nUPLOADED=${ok.length} FAILED=${ko.length}`);
console.log("OK_EANS:" + ok.join(","));
