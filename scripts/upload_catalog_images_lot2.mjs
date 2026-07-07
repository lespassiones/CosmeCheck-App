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
  "3700076442748": "https://incibeauty.com/photos/f/9/7/f97c21357b1226b8f998fa75bc36205b.jpg",
  "8025272648066": "https://incibeauty.com/photos/3/c/9/3c929683bdc1c77a407c1d509121bb85.jpg",
  "4015165328315": "https://incibeauty.com/photos/5/9/8/59824e836f93b5b2c33cdd33b275b8c3.jpg",
  "80038450": "https://incibeauty.com/photos/5/0/8/508f8f3177f45116cffedeb3345b4a26.jpg",
  "4058172619335": "https://incibeauty.com/photos/b/a/9/ba97d498e5c7f26eeadbd2eb20a19ecf.jpg",
  "4061458006675": "https://incibeauty.com/photos/9/d/8/9d82baa1c49bd769e019c48ff562af.jpg",
  "08544766": "https://incibeauty.com/photos/a/f/4/af4f6ba26875cb9bee7728831d15d48.jpg",
  "3605972163561": "https://incibeauty.com/photos/e/3/3/e33575c575ae0208cddc79f0379b7a08.jpg",
  "0816248021123": "https://incibeauty.com/photos/f/b/1/fb15dc5910a0f21642fb843e557262d0.jpg",
  "8807779097727": "https://incibeauty.com/photos/1/0/e/10e2264e8c6757cc8465c99dfc448558.jpg",
  "8436097096114": "https://incibeauty.com/photos/0/7/d/07d953a1ce3499a167497a7227814e16.jpg",
  "3178040208056": "https://incibeauty.com/photos/6/e/c/6ec79f16da6351648fd74a37a4704eda.jpg",
  "8994993018840": "https://incibeauty.com/photos/f/f/c/ffc9acc3a4153659661baf8ca88b5a23.jpg",
  "8015150781695": "https://incibeauty.com/photos/a/b/c/abc9aa1774411e12acf78329772cc1ad.jpg",
  "0885190830152": "https://incibeauty.com/photos/5/4/a/54a29248947dbe7ef77db866880caed.jpg",
  "4015165332466": "https://incibeauty.com/photos/e/c/a/ecae7999fdc2cd8b7ac50721b37f85aa.jpg",
  "0671315019386": "https://incibeauty.com/photos/b/3/e/b3e53b13aa4a3a89d855a1ecf518a72.jpg",
  "3454220261210": "https://incibeauty.com/photos/3/b/b/3bba7144fe2f485a6728beea3f36e3a9.jpg",
  "7702018581832": "https://incibeauty.com/photos/e/1/2/e12d81467cc7fe237fbf5352a72ca9d.jpg",
  "3253581244340": "https://incibeauty.com/photos/5/6/0/560b37f8f2b80bc7dfe7a7d707df0fe.jpg",
  "0712145865429": "https://incibeauty.com/photos/2/9/4/294da8347fb5a4e51925ced3e178dca.jpg",
  "8056457343490": "https://incibeauty.com/photos/e/6/8/e680d18fbd204366e7e51384711f3d.jpg",
  "8057968091900": "https://incibeauty.com/photos/e/d/a/eda1c0252a8c85e4494af1dcd1186b.jpg",
  "8901030974526": "https://incibeauty.com/photos/1/d/5/1d5035a3222dc293929c274ec6f7b.jpg",
  "3800225902465": "https://incibeauty.com/photos/e/1/b/e1b4e3eaea8ecf6b5f9f0e153b7c0b9d.jpg",
  "3499320003001": "https://incibeauty.com/photos/a/9/6/a96b708c11c8eee0e4356451308dc3ca.jpg",
  "8480000787323": "https://incibeauty.com/photos/5/a/1/5a162a2a987856a4d7abbc22f31e67.jpg",
  "8410436163446": "https://incibeauty.com/photos/f/4/2/f4254e58c71b26d1b8e66368b370477b.jpg",
  "5201641749944": "https://incibeauty.com/photos/5/8/c/58cc1c0a003a852181b8988f58fa271d.jpg",
  "5903991430854": "https://incibeauty.com/photos/1/4/d/14d21f1edd4046b75312aabc807bafa9.jpg",
  "8901030945489": "https://incibeauty.com/photos/2/0/4/204599389f63b41ef58256bc7e5826.jpg",
  "6130601006690": "https://incibeauty.com/photos/7/1/2/712fe91c3e4b4cd35e7cd25ee1187f.jpg",
  "8809248459449": "https://incibeauty.com/photos/a/2/c/a2c5f413d7ad585797c91ab13413d55.jpg",
  "0812343031142": "https://incibeauty.com/photos/b/4/6/b46dd124b5e561f3f4706014e690d214.jpg",
  "5900116097336": "https://incibeauty.com/photos/3/b/e/3bec15ed769824981c77158d98291.jpg",
  "3800225902458": "https://incibeauty.com/photos/6/3/9/6396c054da8f4f697a4668bf8057b13.jpg",
  "6281006424548": "https://incibeauty.com/photos/8/7/3/8736a9de181dab8334bbcb3952a2cc.jpg",
  "5906323006802": "https://incibeauty.com/photos/f/f/f/fff9b843c3d311a0961bfad492284a.jpg",
  "8435118471343": "https://incibeauty.com/photos/0/5/d/05d3432e023621e76ca4a97bf8faaf3b.jpg",
  "8053732165204": "https://incibeauty.com/photos/f/c/6/fc69a4d49cd0c51db2594f796c8c1d94.jpg",
  "5902169047696": "https://incibeauty.com/photos/f/6/c/f6c9f72536d1a9e070eead46cad58d8d.jpg",
  "5010251523314": "https://incibeauty.com/photos/6/f/b/6fb1f2d49e97dc91b6f53430fca9fdc1.jpg",
  "8901030702020": "https://incibeauty.com/photos/2/4/4/244f3a1b5c47f9db979f4995d3daac.jpg",
  "7640147023451": "https://incibeauty.com/photos/1/2/9/129285ff37d640349167fb493cd32b99.jpg",
  "0667551177843": "https://incibeauty.com/photos/8/b/1/8b189ab95365f58b03a3ac943ffc0448.jpg",
  "5900717600515": "https://incibeauty.com/photos/6/f/f/6ff3d27fe62f230d2f44d162445d341.jpg",
  "6001159129356": "https://incibeauty.com/photos/3/0/5/305a213cc9119ffa8cbe5c83285cefac.jpg",
  "3666057016066": "https://incibeauty.com/photos/0/5/a/05a6417652ec9fd58b7ccafcc01229b5.jpg",
  "3660005097749": "https://incibeauty.com/photos/products/large/4/b/c/4bcd229966d98a8bc5f532a8466d520a.png",
  "5904302000995": "https://incibeauty.com/photos/e/6/b/e6baff1c194a72d3a85644d584ac6f04.jpg",
  "5059018408037": "https://incibeauty.com/photos/3/c/1/3c15ac8e8e843c851c7977651dec52ef.jpg",
  "8999999056865": "https://incibeauty.com/photos/a/2/a/a2ad77d48a763a01d5eaddb6659a0cf.jpg",
  "4806518334592": "https://incibeauty.com/photos/4/5/a/45a493d08076bba1920dacbf6cef5fd9.jpg",
  "5900017108322": "https://incibeauty.com/photos/b/9/5/b954ef4e1fc165a0bf75dc4b7556fd1e.jpg",
  "4005808919574": "https://incibeauty.com/photos/b/a/c/bac28bad7cddedfb97439f481c9d20fc.jpg",
  "3600521704820": "https://incibeauty.com/photos/7/6/a/76a35363ff96818187281da28b3b29a5.jpg",
  "8001090274632": "https://incibeauty.com/photos/e/a/a/eaacdb87ce42ef12e236203f29af55dc.jpg",
  "8410436250108": "https://incibeauty.com/photos/a/b/8/ab84ed73aef19034854fd887194ef86.jpg",
  "7702277074663": "https://incibeauty.com/photos/9/c/f/9cf07b7db57289a330c1df7aacd6e825.jpg",
  "3574660718003": "https://incibeauty.com/photos/2/b/4/2b47dad55f8e5d2595967e722fefa5e6.jpg",
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
