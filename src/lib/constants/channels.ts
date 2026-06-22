import {
  IconMail, IconBrandWhatsapp, IconMessage, IconPhone,
} from "@tabler/icons-react";

export const CHANNEL_CONFIG = {
  email:    { Icon: IconMail,          color: "#4dabf7", bg: "rgba(77,171,247,0.1)",  label: "Email"    },
  whatsapp: { Icon: IconBrandWhatsapp, color: "#22c97a", bg: "rgba(34,201,122,0.1)",  label: "WhatsApp" },
  sms:      { Icon: IconMessage,       color: "#cc99ff", bg: "rgba(204,153,255,0.1)", label: "SMS"      },
  call:     { Icon: IconPhone,         color: "#f5a623", bg: "rgba(245,166,35,0.1)",  label: "Voice call"},
} as const;

export type ChannelKey = keyof typeof CHANNEL_CONFIG;
