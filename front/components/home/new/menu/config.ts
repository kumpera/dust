interface NavItem {
  title: string;
  href?: string;
  isExternal?: boolean;
  label?: string;
  rows?: number;
}

interface NavItemWithChildren extends NavItem {
  items?: NavItemWithChildren[];
}

interface MenuConfig {
  title: string;
  items: NavItemWithChildren[];
}

const CareersMenuConfig: MenuConfig = {
  title: "Careers",
  items: [
    {
      title: "Jobs",
      href: "https://www.notion.so/dust-tt/Jobs-a67e20f0dc2942fdb77971b73251466e/",
      isExternal: true,
    },
    {
      title: "LinkedIn",
      href: "https://www.linkedin.com/company/dust-tt/",
      isExternal: true,
    },
  ],
};

const AboutMenuConfig: MenuConfig = {
  title: "About",
  items: [
    {
      title: "Blog",
      href: "https://blog.dust.tt/",
      isExternal: true,
    },
    {
      title: "@dust4ai",
      href: "https://x.com/dust4ai",
      isExternal: true,
    },
  ],
};

const LegalMenuConfig: MenuConfig = {
  title: "Legal",
  items: [
    {
      title: "Privacy Policy",
      href: "https://dust-tt.notion.site/Website-Privacy-Policy-a118bb3472f945a1be8e11fbfb733084",
      isExternal: true,
    },
    {
      title: "Terms of Use",
      href: "https://dust-tt.notion.site/Website-Terms-of-Use-ff8665f52c454e0daf02195ec0d6bafb",
      isExternal: true,
    },
    {
      title: "Legal Notice",
      href: "https://dust-tt.notion.site/Legal-Notice-58b453f74d634ef7bb807d29a59b3db1",
      isExternal: true,
    },
    {
      title: "Cookie Notice",
      href: "https://dust-tt.notion.site/Cookie-Notice-ec63a7fb72104a7babff1bf413e2c1ec",
      isExternal: true,
    },
  ],
};

const MoreMenuConfig: MenuConfig = {
  title: "More",
  items: [
    {
      title: CareersMenuConfig.title,
    },
    CareersMenuConfig.items[0],
    CareersMenuConfig.items[1],
    {
      title: AboutMenuConfig.title,
    },
    AboutMenuConfig.items[0],
    AboutMenuConfig.items[1],
    {
      title: LegalMenuConfig.title,
    },
    LegalMenuConfig.items[0],
    LegalMenuConfig.items[1],
    LegalMenuConfig.items[2],
    LegalMenuConfig.items[3],
  ],
};

const SolutionsMenuConfig: MenuConfig = {
  title: "Solutions",
  items: [
    {
      title: "Customer Support",
      href: "/solutions/customer-support",
    },
    {
      title: "Marketing & Content",
      href: "/solutions/marketing-content",
    },
    {
      title: "Recruiting & People",
      href: "/solutions/recruiting-people",
    },
  ],
};

const DevelopersMenuConfig: MenuConfig = {
  title: "Developers",
  items: [
    {
      title: "Dust for engineers",
      href: "/developers",
    },
    {
      title: "Dust Apps & API",
      href: "/solutions/dust-platform",
    },
    {
      title: "Platform Documentation",
      href: "https://docs.dust.tt",
      isExternal: true,
    },
    {
      title: "Github Repo",
      href: "https://github.com/dust-tt/dust",
      isExternal: true,
    },
  ],
};

interface DocsConfig {
  mainNav: NavItemWithChildren[];
  mobileNav: NavItemWithChildren[];
  footerNav: NavItemWithChildren[];
}

export const menuConfig: DocsConfig = {
  mainNav: [
    {
      title: "Product",
      href: "/hidden-copy",
    },
    {
      title: SolutionsMenuConfig.title,
      label: "Dust for...",
      rows: 4,
      items: SolutionsMenuConfig.items,
    },
    {
      title: DevelopersMenuConfig.title,
      label: "Build with Dust",
      rows: 4,
      items: DevelopersMenuConfig.items,
    },
    {
      title: "Pricing",
      href: "/pricing",
    },
    {
      title: "Security",
      href: "/security",
    },
    {
      title: MoreMenuConfig.title,
      label: "All about Dust",
      rows: 3,
      items: MoreMenuConfig.items,
    },
  ],
  mobileNav: [
    {
      title: "Product",
      href: "/hidden-copy",
    },
    {
      title: "Pricing",
      href: "/pricing",
    },
    {
      title: "Security",
      href: "/security",
    },
    {
      title: SolutionsMenuConfig.title,
      items: SolutionsMenuConfig.items,
    },
    {
      title: DevelopersMenuConfig.title,
      items: DevelopersMenuConfig.items,
    },
    {
      title: CareersMenuConfig.title,
      items: CareersMenuConfig.items,
    },
    {
      title: AboutMenuConfig.title,
      items: AboutMenuConfig.items,
    },
    {
      title: LegalMenuConfig.title,
      items: LegalMenuConfig.items,
    },
  ],
  footerNav: [
    {
      title: "Product",
      items: [
        {
          title: "Product",
          href: "/hidden-copy",
        },
        {
          title: "Pricing",
          href: "/pricing",
        },
        {
          title: "Security",
          href: "/security",
        },
      ],
    },
    {
      title: SolutionsMenuConfig.title,
      items: SolutionsMenuConfig.items,
    },
    {
      title: DevelopersMenuConfig.title,
      items: DevelopersMenuConfig.items,
    },
    {
      title: CareersMenuConfig.title,
      items: CareersMenuConfig.items,
    },
    {
      title: AboutMenuConfig.title,
      items: AboutMenuConfig.items,
    },
    {
      title: LegalMenuConfig.title,
      items: LegalMenuConfig.items,
    },
  ],
};
