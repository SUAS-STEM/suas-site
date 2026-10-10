import { CardInfo, Member, Rank } from "./types";

export const APPLICATION_PAGE_URL = "/apply";
export const DEFAULT_LINK_TEXT = "Build Event Horizon-5 With Us";

export const sectionCards: Record<string, CardInfo[]> = {
    Flight: [
        {
            subsystem: "Flight",
            title: "Join Flight",
            description:
                "Flight designs, builds, and maintains the physical aircraft. The subsystem is responsible for creating a strong, lightweight, and foldable airframe while meeting requirements for size, weight, and flight performance. Members work together with Avionics to integrate motors, batteries, electronics, sensors, and other hardware with custom mounts. They are also responsible for manufacturing and assembling the final aircraft using 3D-printed parts, various composite materials, custom-machined aluminum, and other aerospace-grade parts.",
            goodFit: ["Enjoy hands-on building", "Are interested in mechanical or aerospace engineering"],
            skills: [
                "Fusion 360, Onshape, or other CAD",
                "3D printing",
                "Robotics, fabrication, or mechanical assembly",
            ],
        },
    ],
    Avionics: [
        {
            subsystem: "Avionics",
            title: "Avionics Lead",
            subtitle: "Position Open",
            placement: "start",
            linkText: "Learn More",
            description:
                "The Avionics Lead will oversee the design, integration, and testing of the aircraft's electrical systems as well as coordinating the Avionics subsystem and working closely with the Technical Manager and other subsystem leads.",
            note: "This is not a direct entry position. We plan to select the next Avionics Lead from within the team after new member recruitment and training, based on demonstrated technical ability, reliability, communication, and leadership. New members interested in eventually taking on this role are encouraged to join the Avionics subsystem and develop their skills with the team.",
        },
        {
            subsystem: "Avionics",
            title: "Join Avionics",
            description:
                "Avionics is responsible for the electrical systems of the aircraft, including power distribution, batteries, ESCs, motors, flight controllers, telemetry radios, cameras, GNSS, and onboard computers. Members research components, read documentation and data sheets, design wiring and power systems, and physically assemble, test, and iterate on aircraft electronics. The team also helps determine the propulsion and battery architecture for the aircraft.",
            goodFit: [
                "Enjoy electronics, hands-on technical work, and troubleshooting hardware",
                "Are interested in electrical or computer engineering",
            ],
            skills: ["Soldering or breadboarding", "Electronics and circuits", "Robotics or RC"],
        },
    ],
    Software: [
        {
            subsystem: "Software",
            title: "Join Software",
            description:
                "Software develops autonomous flight, ground control, and computer vision systems for the aircraft. Members develop ground control software, image stitching and math algorithms, and work with other hardware on the aircraft, including programs aboard the flight controller. Members are also responsible for operating the aircraft's ground control station, as well as managing the website and cloud infrastructure for the team.",
            goodFit: [
                "Enjoy programming, electronics, or integrating hardware and software",
                "Are interested in computer science, computer engineering, robotics, embedded systems, or computer vision",
            ],
            skills: [
                "Python or C/C++",
                "Computer engineering",
                "Electronics and embedded systems",
                "Computer vision or machine learning",
            ],
        },
    ],
    Doc: [
        {
            subsystem: "Doc",
            title: "Join Doc",
            description:
                "Doc records the team's engineering process, being responsible for maintaining the website, photography of flight testing, and creating graphics and branding. The team is also responsible for technical documentation, including an IEEE-style engineering report explaining the aircraft, design process, testing, and major engineering decisions.",
            goodFit: ["Enjoy writing, design, photography, or video", "Are interested in graphic design or writing"],
            skills: ["Technical or concise writing", "Graphic design", "Photography or video editing"],
        },
    ],
};

export const cardEnabledSubsystems = ["Flight", "Avionics", "Software", "Doc"];

export const applicationSubsystemGroups = [
    {
        title: "Flight",
        sections: ["Flight"],
    },
    {
        title: "Software",
        sections: ["Software"],
    },
    {
        title: "Avionics",
        sections: ["Avionics"],
    },
    {
        title: "Doc",
        sections: ["Doc"],
    },
] as const;

export const sections: { title: string; description: string; members: Member[] }[] = [
    {
        title: "Leadership",
        description: "Board/Technical",
        members: [
            {
                name: "Wenxin Fang",
                grade: 10,
                rank: Rank.ProjectManager,
                about: `I lead SUAS@STEM, focusing on systems integration and avionics development. I'm an aspiring aerospace engineer with an interest in electromechanical systems. Together with the team, we strive to build an environment where we push through adversity and come out stronger than before. When I'm not building autonomous systems or leading a team, you can find me baking a batch of chocolate chip cookies or enjoying the natural beauty of the PNW!`,
            },
            {
                name: "Yu Tane Quah",
                grade: 10,
                rank: Rank.OperationsManager,
                about: `I manage operations for SUAS @STEM which mostly involves team organization and project management. Though I have had no prior experience with engineering itself (don't worry I don't actually build the drone), it's been really interesting getting to know the team and the workflow and applying those same concepts to other areas of my life. It takes a lot to get a group of people on the same page and seeing the community within our team get closer as we experience failures and successes has been really rewarding. In my free time, I love art, working with all kinds of mediums to create graphic designs, animations, and physical artworks, but in general I have a long list of activities that I wish I could have more time for like learning new languages (or strengthening old ones), photography, guitar, taking bike rides through the area and trying out different cafes with friends!`,
            },
            {
                name: "Nithin Ganesh",
                grade: 10,
                rank: Rank.TechnicalManager,
                about: `My name is Nithin, and I'm working toward a future in aerospace engineering. I'm especially drawn to propulsion and energy‑storage systems, the parts of aerospace where physics becomes both elegant and challenging. Flying FPV drones is one of my hobbies, and it is one of my favorite ways to explore flight firsthand. Additionally, I do competitive rocketry which gives me the excitement of turning theory and design into something that actually leaves the ground. When I need a break from designing, testing, or flying, I hop on my bike and enjoy the simple things in life.`,
            },
            {
                name: "Timothy An",
                grade: 10,
                rank: Rank.FinancialManager,
                about: `Hello! My name is Timothy An, and I'm currently a sophomore at Tesla STEM High School with aspirations in aerospace/mechanical engineering. Outside of SUAS, I also compete on a private team in VEX V5 Robotics and am a part of my school's TARC (The American Rocketry Challenge) team. Besides conventional engineering activities, I also participate in the Technology Student Association, where I combine my passions with creating and leadership. Artistically, I play both the bassoon and contrabassoon in various ensembles including the Seattle Youth Symphony Orchestra, WMEA's various All-State Honor Groups, and compete in numerous regional and state festivals.`,
            },
        ],
    },
    {
        title: "Flight",
        description:
            "The Flight subsystem handles the aircraft's physical design and construction.",
        members: [
            {
                name: "Karthik Rajagopal",
                grade: 11,
                rank: Rank.Lead,
                about: `I am Karthik, a current junior at Tesla STEM highschool. Inside of SUAS I prefer taking a lot of top-level CAD roles and helping with general drone assembly. In planning to become an aerospace engineer SUAS has offered rigorous yet valuable experiences as I prepare for life beyond highschool. Other than SUAS, I enjoy reading various science fiction novels and building robots!`,
            },
            {
                name: "Pratham Koka",
                grade: 9,
                rank: Rank.Member,
                about: `I'm a hardworking and energetic member of SUAS at STEM and I like to do robotics and design drones. I am easygoing and fun in general and I am very social as well. I like to ski and hang out with my friends. On SUAS at STEM, I primarily work on CAD, manufacturing, and hardware. I spend a lot of my time designing aircraft and robotic systems such as UAVs, arms, and more. On EH-3 I was one of the main CAD members and I also helped layout and place avionics, structure, and power systems.`,
            },
        ],
    },
    {
        title: "Avionics",
        description: "The Avionics subsystem develops and integrates onboard electronics.",
        members: [
            {
                name: "Akanksha Revuru",
                grade: 11,
                rank: Rank.Member,
                about: `I'm Akanksha, and I work with the electronic components of the drone. If you see any soldering work, it was most likely done by me or Yu Tane. I think I've inhaled more fumes from that than the oxygen I breathe. When I'm not soldering, I'm probably playing the drums, dying in survival Minecraft, or drawing. SUAS has really helped me grow my teamwork skills--I've never been in this large of a team where everyone has such varied roles. It's also helped me connect with people that I'd otherwise probably never get close to. I'm super excited to keep working and get this drone into the sky!`,
            },
            {
                name: "Max Xie",
                grade: 11,
                rank: Rank.Member,
                about: `hello my name is max xie, i am a 11th grader and a member of the avionics team for SUAS. I do cad, coding, and math, and I'm interested in aerospace systems. I aspire to become an engineer. I am excited to be combining my skills to help SUAS at STEM build our UAV for the contest. Outside of SUAS, I enjoy running and making model kits.`,
            },
            { name: "Advay Midha", grade: 10, rank: Rank.Member },
        ],
    },
    {
        title: "Software",
        description: "The Software subsystem develops autonomous flight and ground control software, integrates onboard computers and sensors, and builds computer vision for mapping and target detection.",
        members: [
            {
                name: "Ethan Chan",
                grade: 10,
                rank: Rank.CoLead,
                about: `Hi, I'm Ethan. I serve as a Software Co-Lead for SUAS@STEM and am passionate about STEM, especially software and engineering. I have experience with C++ and Python, optimizing performance across hardware multicore, GPU, and SIMD architectures. Since the age of nine, I've developed a variety of apps, technical utilities, and games. Besides software, I apply my skills in SolidWorks, Autodesk Fusion, Blender, and Autodesk Maya in other projects. Outside of STEM, I play piano and violin, swim, and enjoy exploring nature. My goal is to integrate all my engineering skills into projects that push the limits of  technology and design.`,
            },
            {
                name: "Jeswanth Sri Sai Battula",
                displayName: "Jeswanth Battula",
                grade: 10,
                rank: Rank.CoLead,
                about: `Hi, I'm Jeswanth, and I serve as a pilot and Software Co-Lead for SUAS@STEM, our competitive small unmanned aircraft systems team. I'm passionate about aerospace engineering and autonomous flight, and I enjoy working at the intersection of hands-on flying and advanced flight systems. As a pilot, I'm responsible for safely operating our aircraft during testing and competition, maintaining precision and control under pressure. I also help lead our computer vision efforts, from dataset collection to model training, to ensure consistent performance during autonomous missions. Outside of SUAS, I'm also involved in competitive VEX Robotics, where I design, build, and program robots for high-level competitions. Robotics has strengthened my analytical thinking and collaborative skills, which carry over into aerospace projects. When I'm relaxing, you can usually find me playing pickup basketball, listening to music, trying new foods with friends, or going on long walks to clear my mind and reset.`,
            },
            {
                name: "Neel Nevrekar",
                grade: 10,
                rank: Rank.Member,
                softwareRole: "Imaging",
                about: `Hi! I'm Neel, and I enjoy working on projects that combine teamwork, problem-solving, and real-world impact. In this team, I serve as the imaging project lead. In this role, I help collect and organize datasets and work on training models that allow our system to recognize the mannequin during autonomous missions. I enjoy the collaborative nature of the work, especially brainstorming solutions with teammates and seeing ideas come together through testing and iteration.

Beyond SUAS, I love mentoring younger students and being involved in activities that encourage curiosity and hands-on learning. I've spent time mentoring middle school robotics teams and enjoy helping students build confidence while exploring new challenges. I'm also interested in design and enjoy contributing creatively to projects, especially when they have a meaningful purpose.

In general, I'm someone who enjoys learning by doing and working with others to build things that matter. I'm always excited to take on new challenges, grow through collaboration, and be part of communities that are driven by curiosity and impact.`,
            },
            {
                name: "Zhencheng Lu",
                grade: 10,
                rank: Rank.Member,
                softwareRole: "Imaging",
                about: `Hi, I'm Zhen. I'm a high schooler who's really into engineering and computer science, and I plan to pursue that in college. I spend a lot of my free time on robotics, tinkering with projects, coding, and figuring out how to solve problems in creative ways, spending probably more than I probably should. Outside of school, I'm passionate about producing music, experimenting with different sounds and styles to bring my thoughts to life, and I also shoot Olympic Trap, which has been a huge part of my life this past year. I competed in a state competition where I earned junior first place and in a national competition where I placed 5th in U15, and those experiences taught me a lot about focus, patience, and staying calm under pressure even when the stakes are higher than winning or losing. When I'm not working on projects or practicing, I enjoy hanging out with friends and listening to music, with Travis Scott and Don Toliver being some of my favorite artists.`,
            },
            {
                name: "Ved Agrawal",
                grade: 9,
                rank: Rank.Member,
                softwareRole: "Imaging",
                about: `Hi, I'm Ved Agrawal, and I work on imaging in the Software subsystem at SUAS@STEM. I'm passionate about engineering and interested in mathematics, robotics, physics, and making my own FPV drones. When I'm not working on SUAS projects, you can find me building high-utility custom quads or preparing for the next robotics tournament.`,
            },
        ],
    },
    {
        title: "Doc",
        description: "The Doc subsystem manages team documentation and branding.",
        members: [
            {
                name: "Timothy An",
                grade: 10,
                rank: Rank.Lead,
                about: `Hello! My name is Timothy An, and I'm currently a sophomore at Tesla STEM High School with aspirations in aerospace/mechanical engineering. Outside of SUAS, I also compete on a private team in VEX V5 Robotics and am a part of my school's TARC (The American Rocketry Challenge) team. Besides conventional engineering activities, I also participate in the Technology Student Association, where I combine my passions with creating and leadership. Artistically, I play both the bassoon and contrabassoon in various ensembles including the Seattle Youth Symphony Orchestra, WMEA's various All-State Honor Groups, and compete in numerous regional and state festivals.`,
            },
        ],
    },
];

export const pastMembers: (Member & { subsystem: string })[] = [
    {
        name: "Avnish Dighe",
        grade: 12,
        rank: Rank.Member,
        subsystem: "Flight",
        about: `Hi there!
My name is Avnish Dighe, a Senior at Tesla STEM High School heading to UC Berkeley for Civil & Mechanical Engineering. I enjoy taking on challenging projects and seeking new opportunities to further my knowledge in these exciting fields. On a personal note, I am an Eagle Scout and 3rd Degree Black Belt in Taekwondo. In my free time I enjoy camping, training, and playing guitar. I'm excited to make this thing fly!`,
    },
    {
        name: "Zifeng (Jeff) Gao",
        grade: 12,
        rank: Rank.Member,
        subsystem: "Flight",
        about: `Hi, I'm Jeff, and I am severely addicted to Computer Aided Design. As a senior in SUAS, I bring years of competition experience in FIRST robotics and ARC rocketry to assist the team in designing the EH-3 drone. My insights have helped us select parts, evaluate CAD programs and workflow, and producing reliable 3D printed mounts for the landing gear and the Here4 navigation module. Outside of STEM, I spend my time playing multiplayer Minecraft, alternating between modded worlds (currently playing Elysium Days) and minigame servers – although lately I've been venturing around Seattle on public transit and rediscovering my love for exploration.
As always, I'm still learning and growing, and I'm looking forward to attending the University of Washington as a Mechanical Engineering major (30')`,
    },
    {
        name: "Inesh Dey",
        grade: 12,
        rank: Rank.Lead,
        subsystem: "Autopilot",
        about: `Hello, I'm Inesh Dey, and I'm an avid programmer, who plans to major in Computer Science and/or Engineering. I've been doing robotics for a few years now, having competed in FTC for two, and I've also been involved in volunteering for Ignite Robotics events. I've had experience working with pathing, as well as implementing YOLO (You Only Look Once) models for object detection.

Outside of robotics, and in my free time, I enjoy playing soccer, the guitar (mainly classical), working on personal coding/tech projects and video games. I've repaired and built PCs (including my own), and I love to tinker with tech in general.`,
    },
];
