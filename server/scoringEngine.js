import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.resolve(__dirname, "../config/scoringConfig.json");

export function loadScoringConfig() {
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

function interpolate(value, thresholds) {
  const sorted = [...thresholds].sort((a, b) => {
    const keyA = a.absPercent ?? a.aboveAveragePercent;
    const keyB = b.absPercent ?? b.aboveAveragePercent;
    return keyA - keyB;
  });
  const key = "absPercent" in sorted[0] ? "absPercent" : "aboveAveragePercent";

  if (value <= 0) return 0;
  if (value <= sorted[0][key]) return (value / sorted[0][key]) * sorted[0].points;

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const next = sorted[i];
    if (value <= next[key]) {
      const ratio = (value - prev[key]) / (next[key] - prev[key]);
      return prev.points + ratio * (next.points - prev.points);
    }
  }

  return sorted[sorted.length - 1].points;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function scoreLabel(score, config = loadScoringConfig()) {
  const rounded = Math.round(score);
  const match = config.labels.find((range) => rounded >= range.min && rounded <= range.max);
  return match?.label ?? "Neutral / No Meaningful Change";
}

export function computeScore(inputs, config = loadScoringConfig()) {
  const components = config.components;
  const breakdown = [];

  const pricePercent = inputs.priceChangePercent ?? 0;
  const hitCircuit = Boolean(inputs.hitUpperCircuit || inputs.hitLowerCircuit);
  const pricePoints = hitCircuit
    ? components.priceMovement.circuitHitPoints
    : interpolate(Math.abs(pricePercent), components.priceMovement.thresholds);
  breakdown.push({
    key: "priceMovement",
    label: "Price movement",
    points: clamp(Math.sign(pricePercent) * pricePoints, -25, 25),
    reason: hitCircuit
      ? `${inputs.hitUpperCircuit ? "Upper" : "Lower"} circuit touched`
      : `${pricePercent.toFixed(2)}% move from open`
  });

  const volumeDelta = inputs.volumeVsAveragePercent ?? 0;
  const volumePoints = interpolate(Math.max(0, Math.abs(volumeDelta)), components.volumeVsAverage.thresholds);
  breakdown.push({
    key: "volumeVsAverage",
    label: "Trading volume vs. avg",
    points: clamp(Math.sign(volumeDelta) * volumePoints, -20, 20),
    reason: `${volumeDelta.toFixed(1)}% vs. 30-day average volume`
  });

  const surprise = inputs.earningsSurprisePercent ?? 0;
  const surprisePoints =
    Math.abs(surprise) < 1
      ? components.quarterlyEarningsSurprise.meetPoints
      : clamp((Math.abs(surprise) / 20) * components.quarterlyEarningsSurprise.maxPoints, 0, 15);
  breakdown.push({
    key: "quarterlyEarningsSurprise",
    label: "Quarterly earnings surprise",
    points: clamp(Math.sign(surprise || 0.1) * surprisePoints, -15, 15),
    reason: `${surprise.toFixed(1)}% vs. expectation`
  });

  const sentiment = clamp(inputs.newsSentimentScore ?? 0, -1, 1);
  breakdown.push({
    key: "newsSentiment",
    label: "News sentiment",
    points: sentiment * components.newsSentiment.maxPoints,
    reason: `${sentiment.toFixed(2)} aggregate sentiment for period news`
  });

  const technical = clamp(inputs.technicalSignalScore ?? 0, -1, 1);
  breakdown.push({
    key: "technicalIndicators",
    label: "Technical indicators",
    points: technical * components.technicalIndicators.maxPoints,
    reason: inputs.technicalReason ?? "RSI, moving-average and MACD composite"
  });

  const analyst = inputs.analystRatingChange ?? "none";
  const analystPoints = analyst === "upgrade" ? 5 : analyst === "downgrade" ? -5 : analyst === "initiation" ? 2 : 0;
  breakdown.push({
    key: "analystRatingChange",
    label: "Analyst rating change",
    points: analystPoints,
    reason: analyst === "none" ? "No rating change detected" : analyst
  });

  const corporateSign = inputs.corporateActionImpact ?? 0;
  breakdown.push({
    key: "corporateAction",
    label: "Corporate action",
    points: clamp(corporateSign, -1, 1) * components.corporateAction.maxPoints,
    reason: inputs.corporateActionReason ?? "Dividend, split, buyback, block deal or fundraise signal"
  });

  const userEventSign = inputs.userSpecificEventImpact ?? 0;
  breakdown.push({
    key: "userSpecificEvent",
    label: "User-specific event",
    points: clamp(userEventSign, -1, 1) * components.userSpecificEvent.maxPoints,
    reason: inputs.userSpecificEventReason ?? "No custom trigger fired"
  });

  const score = clamp(
    breakdown.reduce((sum, item) => sum + item.points, 0),
    -100,
    100
  );

  return {
    score: Math.round(score),
    label: scoreLabel(score, config),
    breakdown: breakdown.map((item) => ({ ...item, points: Number(item.points.toFixed(1)) }))
  };
}
