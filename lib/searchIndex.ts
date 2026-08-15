// Static search index of public site pages only.
// Do NOT add /ssgcs, /dev, /dev-login, or any /api/* route here — those are
// private/internal or download tooling and must never surface in search.
//
// `content` mirrors real page text so search matches body copy, not just titles.
// Keep it in sync by hand when page copy changes — there's no CMS/build-time crawl.
export type SearchEntry = {
  title: string;
  url: string;
  content: string;
};

export const searchIndex: SearchEntry[] = [
  {
    title: "Home",
    url: "/",
    content:
      "SUAS Tesla STEM High School We're flying ahead. SUAS@STEM is Tesla STEM High School's " +
      "competition team for the RoboNation Student Unmanned Aerial Systems (SUAS) competition. " +
      "Our team designs and builds autonomous drones capable of performing complex real-world " +
      "missions including navigation, computer vision, and payload delivery. We are currently " +
      "designing and testing our fourth aircraft, Event Horizon-4, and are excited to represent " +
      "Tesla STEM High School at Skyway Range in Tulsa, Oklahoma. SUAS@STEM is affiliated with " +
      "Tesla STEM's Engineering Club.",
  },
  {
    title: "Team",
    url: "/team",
    content:
      "Team roster members leads operations lead project manager flight avionics autopilot " +
      "imaging doc board subsystems. Wenxin Fang, Yu Tane Quah, Karthik Rajagopal, Pratham Koka, " +
      "Nithin Ganesh, Ivana Mohapatra, Akanksha Revuru, Max Xie, Advay Midha, Jeswanth Sri Sai " +
      "Battula, Ethan Chan, Neel Nevrekar, Zhencheng Lu, Timothy An, Ved Agrawal, Avnish Dighe, " +
      "Zifeng (Jeff) Gao, Inesh Dey.",
  },
  {
    title: "Gallery",
    url: "/gallery",
    content: "Gallery photos pictures images of the team and aircraft.",
  },
  {
    title: "Aircraft — Event Horizon-4",
    url: "/aircraft",
    content:
      "Event Horizon-4 (EH-4) is the fourth aircraft in a generation of large, endurance-based, " +
      "autonomous quadcopter developed by the SUAS@STEM team. It features a 2-meter, " +
      "tri-foldable airframe. Highlights: Tip-to-Tip Diameter 173.5 cm (68.3 in), Specific " +
      "Thrust Efficiency 7.62 g/W, Hover Flight Time 45 min. Flight specs: Weight 11 kg " +
      "(24.3 lbs), Dimensions 173.5 x 173.5 x 42.7 cm, Takeoff/Landing VTOL, Cruise Speed " +
      "25 kph (15 mph), Conservative Range 22.5 km (14 mi). Electrical specs: Battery 16S LiPo, " +
      "Flight Stack ArduPilot, Video/Data Link Digital transmission, Flight Controller " +
      "STMicroelectronics STM32H757, RC Link 2.4 GHz manual 900 MHz autopilot 5 GHz data video, " +
      "Positioning RTK-enabled GPS. Key Design Principles: Efficiency, Deployability, " +
      "Modularity.",
  },
  {
    title: "Contact",
    url: "/sponsor",
    content:
      "Contact. Help send SUAS@STEM to the competition. Whether it's funding, parts, or " +
      "mentorship, we'd love to hear from you — drop us a note below and we'll get back to you. " +
      "Name Company Email Message Send contact sponsorship donate support funding.",
  },
];
