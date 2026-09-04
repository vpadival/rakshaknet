const COMMON_ESSENTIALS = [
  "mobile phone",
  "power bank / charger",
  "drinking water",
  "essential medicines",
  "government ID / important documents",
  "small first-aid kit",
  "torch / flashlight",
];

const GUIDANCE = {
  flood: {
    title: "Flood evacuation",
    carry: [
      ...COMMON_ESSENTIALS,
      "dry food / energy snacks",
      "raincoat or waterproof covering",
      "extra clothes",
    ],
    beforeLeaving: [
      "Switch off electricity and gas only if it is safe to do so.",
      "Keep important documents and electronics in waterproof covers.",
      "Help children, elderly people and persons with disabilities evacuate early.",
      "Move valuables only if doing so does not delay evacuation.",
    ],
    whileMoving: [
      "Move toward higher ground or the designated safe zone.",
      "Use official or recommended evacuation routes.",
      "Stay with your group whenever possible.",
      "Keep monitoring official alerts.",
    ],
    avoid: [
      "Do not walk or drive through flood water.",
      "Stay away from open drains, culverts and fast-moving water.",
      "Avoid bridges if water is flowing over or near the deck.",
      "Stay away from fallen electrical wires and submerged electrical equipment.",
    ],
  },
  fire: {
    title: "Forest-fire evacuation",
    carry: [
      ...COMMON_ESSENTIALS,
      "N95/KN95 mask if available",
      "wet cloth or clean cloth for smoke protection",
      "full-sleeve clothing",
    ],
    beforeLeaving: [
      "Evacuate immediately when instructed.",
      "Close doors and windows if time and conditions allow.",
      "Keep flammable materials away from exits.",
      "Inform others nearby who may not have received the alert.",
    ],
    whileMoving: [
      "Move away from smoke and fire toward the designated safe zone.",
      "Prefer routes with clear visibility and minimal vegetation.",
      "Stay low if smoke becomes dense.",
      "Keep your nose and mouth covered.",
    ],
    avoid: [
      "Do not move toward the fire to observe or record it.",
      "Do not enter dense smoke.",
      "Avoid dry vegetation and narrow escape routes.",
      "Do not return to the affected area until authorities declare it safe.",
    ],
  },
  pollution: {
    title: "Air-pollution safety",
    carry: [
      "N95/KN95 mask",
      "essential medicines",
      "mobile phone",
      "water",
      "inhaler if personally prescribed",
    ],
    beforeLeaving: [
      "Close windows and doors before leaving if indoor air is safer.",
      "Reduce strenuous activity.",
      "Ensure vulnerable people have their required medication.",
    ],
    whileMoving: [
      "Use the shortest safe route to the designated shelter.",
      "Wear a properly fitted particulate mask where appropriate.",
      "Minimize time spent outdoors.",
    ],
    avoid: [
      "Avoid strenuous outdoor exercise.",
      "Avoid smoke, industrial emission areas and heavy traffic corridors.",
      "Do not rely on cloth masks for fine particulate pollution.",
    ],
  },
  earthquake: {
    title: "Post-earthquake evacuation",
    carry: [...COMMON_ESSENTIALS, "sturdy footwear", "whistle"],
    beforeLeaving: [
      "Check yourself and nearby people for injuries.",
      "Turn off gas or electricity only if damage is suspected and it is safe.",
      "Expect aftershocks.",
    ],
    whileMoving: [
      "Move calmly to the designated open safe area.",
      "Use stairs instead of elevators.",
      "Watch for damaged buildings, broken glass and debris.",
    ],
    avoid: [
      "Do not enter visibly damaged buildings.",
      "Do not stand near walls, glass facades or power lines.",
      "Do not use elevators.",
      "Avoid blocking emergency access routes.",
    ],
  },
};

const DEFAULT_GUIDANCE = {
  title: "Emergency evacuation",
  carry: COMMON_ESSENTIALS,
  beforeLeaving: ["Follow local authority instructions."],
  whileMoving: [
    "Move toward the designated safe zone.",
    "Stay calm and remain with your group.",
  ],
  avoid: ["Avoid unsafe or restricted areas."],
};

const COMMON_STEPS = [
  "Check the recommended safe zone.",
  "Collect essential emergency items.",
  "Help children, elderly people and vulnerable neighbours.",
  "Secure utilities only if safe.",
  "Leave using the recommended route.",
  "Keep monitoring official alerts.",
];

function getEvacuationGuidance(hazard) {
  return { ...(GUIDANCE[hazard] || DEFAULT_GUIDANCE), steps: COMMON_STEPS };
}

function buildEmergencySms({ hazard, level, zoneName, safeZone }) {
  const guidance = getEvacuationGuidance(hazard);
  const safeZoneName = safeZone?.name || "designated safe zone";
  const carryShort = guidance.carry.slice(0, 5).join(", ");
  const avoidShort = guidance.avoid[0] || "Avoid affected areas.";

  return [
    `RAKSHAKNET ALERT: ${String(level).toUpperCase()} ${String(hazard).toUpperCase()} risk in ${zoneName}.`,
    `Move toward ${safeZoneName}.`,
    `Carry: ${carryShort}.`,
    avoidShort,
    "Follow official instructions.",
  ].join(" ");
}

module.exports = { getEvacuationGuidance, buildEmergencySms };
