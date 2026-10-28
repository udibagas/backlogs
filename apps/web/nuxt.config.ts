import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  app: {
    head: {
      title: "Sprintline - Project Management"
      // link: [{ rel: "icon", type: "image/x-icon", href: "/images/logo.png" }]
    }
  },
  compatibilityDate: "2025-01-01",
  devtools: { enabled: false },
  modules: ["@element-plus/nuxt"],
  elementPlus: {
    importStyle: "scss",
    themeChalk: {
      $colors: {
        primary: { base: "rgba(107,33,168, 1)" }
      },
      "$border-radius": {
        base: "16px"
      },
      $card: {
        "border-radius": "8px"
      },
      $messagebox: {
        "border-radius": "8px"
      }
    }
  },
  css: ["~/assets/css/main.css"],
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: ["dayjs/plugin/*.js", "zod"]
    }
  },
  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE ?? "http://localhost:4000/api/v1"
    }
  },
  typescript: { strict: true }
});
