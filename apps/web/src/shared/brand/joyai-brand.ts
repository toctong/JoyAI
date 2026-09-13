/** Brand chrome: Mirora mark from ai-video; feed/mascot still joyai.com refs. */
export const JOYAI_BRAND = {
  /** Sidebar / compact mark (ai-video mirora-mark) */
  logo: "/brand/mirora-mark.png",
  /** Full wordmark for login etc. */
  logoFull: "/brand/mirora-logo.png",
  mascot:
    "https://img13.360buyimg.com/img/jfs/t1/458913/9/16538/45397/6a3e4ac6F0a962d5c/02760fd0d31215fc.png",
  heroBg:
    "https://img13.360buyimg.com/img/jfs/t1/409857/33/7874/123082/69c64450F851d24f9/0276b406546ef587.png",
  nav: {
    inspire:
      "https://img14.360buyimg.com/ling/jfs/t1/407803/26/14662/1362/69c495f4F7b28982b/02760400404d7174.png",
    studio:
      "https://img30.360buyimg.com/img/jfs/t1/415138/22/12038/1184/69d75d64F8b695d9b/0276030030d6d90f.png",
    canvas:
      "https://img30.360buyimg.com/img/jfs/t1/487429/19/9123/1192/6a6b0f51F5c168daa/027603003043ebad.png",
    assets:
      "https://img10.360buyimg.com/img/jfs/t1/433705/28/18049/685/6a0c06eaF7564496c/0276040040f74bb4.png",
  },
  remote: {
    logo: "/brand/mirora-mark.png",
    logoFull: "/brand/mirora-logo.png",
    mascot:
      "https://img13.360buyimg.com/img/jfs/t1/458913/9/16538/45397/6a3e4ac6F0a962d5c/02760fd0d31215fc.png",
    heroBg:
      "https://img13.360buyimg.com/img/jfs/t1/409857/33/7874/123082/69c64450F851d24f9/0276b406546ef587.png",
    navInspire:
      "https://img14.360buyimg.com/ling/jfs/t1/407803/26/14662/1362/69c495f4F7b28982b/02760400404d7174.png",
    navStudio:
      "https://img30.360buyimg.com/img/jfs/t1/415138/22/12038/1184/69d75d64F8b695d9b/0276030030d6d90f.png",
    navCanvas:
      "https://img30.360buyimg.com/img/jfs/t1/487429/19/9123/1192/6a6b0f51F5c168daa/027603003043ebad.png",
    navAssets:
      "https://img10.360buyimg.com/img/jfs/t1/433705/28/18049/685/6a0c06eaF7564496c/0276040040f74bb4.png",
    avatar:
      "https://img20.360buyimg.com/img/jfs/t1/413203/31/2124/1791/69cba189F01d9bf7e/0276018018065918.png",
  },
} as const;

export type InspirationDemo = {
  id: string;
  title: string;
  author: string;
  prompt: string;
  image: string;
  /** width span: 1 normal, 2 banner */
  span?: 1 | 2;
  aspect?: "tall" | "square" | "wide";
};

/** High-quality demo feed matching joyai.com masonry density */
export const INSPIRATION_DEMO: InspirationDemo[] = [
  {
    id: "banner-1",
    title: "未来青年 AI 探索者计划",
    author: "JoyAI",
    prompt: "科技感海报，未来青年，霓虹光效",
    image:
      "https://public-resource.suhulei.com/agent/3acbe8f8-0f38-46c1-8cee-0eafd4e5e7ec.jpg",
    span: 2,
    aspect: "wide",
  },
  {
    id: "d1",
    title: "光之旅人",
    author: "AI岚",
    prompt: "逆光人像，丁达尔光柱，电影感，写实",
    image:
      "https://img20.360buyimg.com/aiher/jfs/t1/416760/11/8851/115680/69d8d5f8Fefe91330/09db2d05005b366d.jpg.webp!q70",
    aspect: "tall",
  },
  {
    id: "d2",
    title: "日落山脊",
    author: "AI岚",
    prompt: "日落山脉剪影，金色云海，广角风光",
    image:
      "https://public-resource.suhulei.com/image/a235c35d035b844fee82cf54c5d1925651.png",
    aspect: "square",
  },
  {
    id: "d3",
    title: "星尘漩涡",
    author: "AI岚",
    prompt: "微观星尘漩涡，深色金属质感，微距",
    image:
      "https://img20.360buyimg.com/aiher/jfs/t1/416781/6/8923/61859/69d8d5dbFca7b92cd/09db2d05006fc3da.jpg.webp!q70",
    aspect: "tall",
  },
  {
    id: "d4",
    title: "表情贴纸",
    author: "AI岚",
    prompt: "3D表情贴纸拼贴，撕纸纹理，趣味插画",
    image:
      "https://public-resource.suhulei.com/image/a2fac39197654142b2bb7a125567462696.png",
    aspect: "tall",
  },
  {
    id: "d5",
    title: "金属纹理",
    author: "AI岚",
    prompt: "拉丝金属抽象纹理，冷色调，产品背景",
    image:
      "https://img20.360buyimg.com/aiher/jfs/t1/414281/22/16886/111856/69d8d5e6F14f4eb8a/09db2d0500f8bf7e.jpg.webp!q70",
    aspect: "tall",
  },
  {
    id: "d6",
    title: "霓虹人像",
    author: "AI岚",
    prompt: "霓虹灯下的时尚人像，赛博氛围，半身特写",
    image:
      "https://public-resource.suhulei.com/image/a20a951e3e74e7476cb90f249b0de5b6ed.png",
    aspect: "tall",
  },
  {
    id: "d7",
    title: "静物光影",
    author: "AI岚",
    prompt: "柔光静物，极简构图，高级感产品摄影",
    image:
      "https://img20.360buyimg.com/aiher/jfs/t1/416513/6/8767/52769/69d8d5edF51a4bc41/09db2d050009fdb5.jpg.webp!q70",
    aspect: "tall",
  },
  {
    id: "d8",
    title: "抽象流体",
    author: "AI岚",
    prompt: "彩色流体抽象，高饱和，艺术壁纸",
    image:
      "https://public-resource.suhulei.com/image/a2e3314f4c44094584ae3bd894751445a2.png",
    aspect: "square",
  },
  {
    id: "d9",
    title: "城市夜景",
    author: "AI岚",
    prompt: "雨夜城市街道，霓虹倒影，电影宽画幅",
    image:
      "https://img20.360buyimg.com/aiher/jfs/t1/415579/31/13286/63469/69d8d5efF24e0b5a0/09db2d05002ea200.jpg.webp!q70",
    aspect: "tall",
  },
  {
    id: "d10",
    title: "森系少女",
    author: "AI岚",
    prompt: "森系少女，自然光，浅景深，胶片感",
    image:
      "https://public-resource.suhulei.com/image/a2d5bc08413cbc498f84fe629de42d6c1a.png",
    aspect: "tall",
  },
];
