export const TEMPORAL_TRACKS = {
  initial_state: "EPISODE STATE", terminal_state: "EPISODE STATE",
  approach: "HUMAN BEHAVIOUR", position: "HUMAN BEHAVIOUR", tension: "HUMAN BEHAVIOUR", iron_stroke: "HUMAN BEHAVIOUR", iron_hold: "HUMAN BEHAVIOUR", reposition: "HUMAN BEHAVIOUR", inspect: "HUMAN BEHAVIOUR", release: "HUMAN BEHAVIOUR",
  anchor: "INTERACTION", slip: "FABRIC RESPONSE",
} as const;

export type TemporalLabel = keyof typeof TEMPORAL_TRACKS;
export type CandidateLabel = TemporalLabel | "inspect_candidate";
export type TemporalTrack = (typeof TEMPORAL_TRACKS)[TemporalLabel];
export type CandidateStatus = "candidate" | "accepted" | "rejected" | "adjusted";
export type TemporalCandidate = {
  episode_id: string; candidate_id: string; track: TemporalTrack; proposed_label: CandidateLabel;
  start_frame: number; end_frame: number; start_time_sec: number; end_time_sec: number; duration_sec: number;
  candidate_score: number | null; evidence: string; review_status: CandidateStatus;
  source_type: "model_estimated" | "auto_tracked" | "human_verified"; algorithm_version: "temporal_candidate_v0_1";
  original_start_time_sec?: number; original_end_time_sec?: number; original_label?: CandidateLabel;
};

type HandSample = { timestamp_sec: number; hand_index: number; center_x_px: number; center_y_px: number };
type ToolSample = { timestamp_sec: number; center_x_px: number; center_y_px: number; tracking_status: string };
type SlipSample = { start_time_sec: number; end_time_sec: number; candidate_score: number; evidence: string };
type RgbSample = { time: number; score: number };
type CandidateInputs = { episodeId: string; duration: number; fps: number; hands: HandSample[]; tools: ToolSample[]; toolOnGarmentTimes: number[]; slips: SlipSample[]; rgb: RgbSample[]; garmentMaskAvailable: boolean };

const round = (value: number) => Math.round(value * 1000) / 1000;
const distance = (a: { center_x_px: number; center_y_px: number }, b: { center_x_px: number; center_y_px: number }) => Math.hypot(b.center_x_px - a.center_x_px, b.center_y_px - a.center_y_px);
const acceptedLabel = (label: CandidateLabel): TemporalLabel => label === "inspect_candidate" ? "inspect" : label;
export { acceptedLabel };

const INITIAL_STATE_BOUNDARY_LABELS = new Set<TemporalLabel>(["approach", "position", "tension", "iron_stroke", "anchor"]);
const TERMINAL_STATE_BOUNDARY_LABELS = new Set<TemporalLabel>(["release", "reposition", "iron_stroke", "anchor", "slip"]);

export function enforceEpisodeStateBoundaries(candidates: TemporalCandidate[], fps: number): TemporalCandidate[] {
  const accepted = candidates.filter((candidate) => candidate.review_status === "accepted");
  const earliestManipulationStart = accepted
    .filter((candidate) => INITIAL_STATE_BOUNDARY_LABELS.has(acceptedLabel(candidate.proposed_label)))
    .reduce<number | null>((earliest, candidate) => earliest === null ? candidate.start_time_sec : Math.min(earliest, candidate.start_time_sec), null);
  const latestManipulationEnd = accepted
    .filter((candidate) => TERMINAL_STATE_BOUNDARY_LABELS.has(acceptedLabel(candidate.proposed_label)))
    .reduce<number | null>((latest, candidate) => latest === null ? candidate.end_time_sec : Math.max(latest, candidate.end_time_sec), null);

  return candidates.map((candidate) => {
    const label = acceptedLabel(candidate.proposed_label);
    if (label === "initial_state" && earliestManipulationStart !== null && candidate.end_time_sec > earliestManipulationStart) {
      const end = Math.max(candidate.start_time_sec, earliestManipulationStart);
      return { ...candidate, end_time_sec: end, end_frame: Math.round(end * fps), duration_sec: round(end - candidate.start_time_sec) };
    }
    if (label === "terminal_state" && latestManipulationEnd !== null && candidate.start_time_sec < latestManipulationEnd) {
      const start = Math.min(candidate.end_time_sec, latestManipulationEnd);
      return { ...candidate, start_time_sec: start, start_frame: Math.round(start * fps), duration_sec: round(candidate.end_time_sec - start) };
    }
    return candidate;
  });
}

export function generateTemporalCandidates(input: CandidateInputs): TemporalCandidate[] {
  const proposed: Omit<TemporalCandidate, "candidate_id">[] = [];
  const add = (label: CandidateLabel, start: number, end: number, score: number | null, evidence: string, source_type: "model_estimated" | "auto_tracked" = "auto_tracked") => {
    const canonical = acceptedLabel(label); const safeStart = round(Math.max(0, Math.min(input.duration, start))); const safeEnd = round(Math.max(safeStart, Math.min(input.duration, end)));
    if (safeEnd - safeStart < .08) return;
    proposed.push({ episode_id: input.episodeId, track: TEMPORAL_TRACKS[canonical], proposed_label: label, start_frame: Math.round(safeStart * input.fps), end_frame: Math.round(safeEnd * input.fps), start_time_sec: safeStart, end_time_sec: safeEnd, duration_sec: round(safeEnd - safeStart), candidate_score: score === null ? null : Math.round(score * 1000) / 1000, evidence, review_status: "candidate", source_type, algorithm_version: "temporal_candidate_v0_1" });
  };
  const handTimes = [...new Set(input.hands.map((item) => item.timestamp_sec))].sort((a,b) => a-b);
  const tools = [...input.tools].filter((item) => item.tracking_status !== "review_required").sort((a,b) => a.timestamp_sec-b.timestamp_sec);
  const toolOnGarment = new Set(input.toolOnGarmentTimes.map((time)=>time.toFixed(3)));
  const activityTimes = [...handTimes, ...tools.map((item) => item.timestamp_sec)].sort((a,b) => a-b);
  const firstActivity = activityTimes[0]; const lastActivity = activityTimes.at(-1);
  const lowMotion = input.rgb.length ? input.rgb.filter((item) => item.score < .03).length / input.rgb.length : 0;
  if (firstActivity !== undefined && firstActivity > .25) add("initial_state", 0, Math.max(.1, firstActivity - .15), Math.min(.95,.65 + lowMotion*.2), `beginning=true; first visible hand/tool sample=${firstActivity.toFixed(3)} sec; low RGB-response samples=${Math.round(lowMotion*100)}%.`, "model_estimated");
  if (lastActivity !== undefined && input.duration - lastActivity > .25) add("terminal_state", Math.min(input.duration-.1,lastActivity+.15), input.duration, Math.min(.95,.65 + lowMotion*.2), `end_of_video=true; last visible hand/tool sample=${lastActivity.toFixed(3)} sec; low RGB-response samples=${Math.round(lowMotion*100)}%.`, "model_estimated");
  if (firstActivity !== undefined && input.garmentMaskAvailable) add("approach", Math.max(0,firstActivity-1.5), firstActivity, .68, `garment_mask=true; first hand/tool activity=${firstActivity.toFixed(3)} sec; interval ends before sustained tracked interaction.`, "model_estimated");
  if (input.garmentMaskAvailable && handTimes.length) add("position", handTimes[0], Math.min(input.duration,handTimes[0]+1), .56, `hand near seeded garment work region; garment motion evidence available; no sustained stroke established in this interval.`, "model_estimated");
  for (let index=1; index<tools.length; index+=1) {
    const previous=tools[index-1], current=tools[index], displacement=distance(previous,current), elapsed=current.timestamp_sec-previous.timestamp_sec;
    if (elapsed<=0) continue;
    const overlapsGarment=toolOnGarment.has(previous.timestamp_sec.toFixed(3))&&toolOnGarment.has(current.timestamp_sec.toFixed(3));
    if (overlapsGarment && elapsed<=3 && displacement>=18) add("iron_stroke", previous.timestamp_sec,current.timestamp_sec,Math.min(.94,.58+displacement/300),`tool_on_garment=true; tool_displacement=${displacement.toFixed(1)} px; duration=${elapsed.toFixed(3)} sec; continuous sampled track.`,"auto_tracked");
    else if (overlapsGarment && elapsed>=.5 && elapsed<=3 && displacement<=8) add("iron_hold",previous.timestamp_sec,current.timestamp_sec,.62,`tool_on_garment=true; tool_displacement=${displacement.toFixed(1)} px; duration=${elapsed.toFixed(3)} sec; stationary visible overlap candidate.`,"auto_tracked");
    else if (displacement>=35) add("reposition",previous.timestamp_sec,current.timestamp_sec,.52,`active stroke not established; tracked tool location changed ${displacement.toFixed(1)} px across ${elapsed.toFixed(3)} sec.`,"auto_tracked");
  }
  const handsByTime = new Map<number,HandSample[]>(); input.hands.forEach((hand)=>handsByTime.set(hand.timestamp_sec,[...(handsByTime.get(hand.timestamp_sec)??[]),hand]));
  const pairedTimes=[...handsByTime.entries()].filter(([,items])=>items.length>=2).map(([time])=>time).sort((a,b)=>a-b);
  if (input.garmentMaskAvailable && pairedTimes.length>=2 && tools.length>=2) {
    const firstHands=handsByTime.get(pairedTimes[0])!, lastHands=handsByTime.get(pairedTimes.at(-1)!)!;
    const handDisplacement=Math.min(...firstHands.map((first)=>Math.min(...lastHands.map((last)=>distance(first,last)))));
    const toolDisplacement=distance(tools[0],tools.at(-1)!);
    if (handDisplacement<=18 && toolDisplacement>=18) add("anchor",pairedTimes[0],pairedTimes.at(-1)!,Math.min(.9,.6+toolDisplacement/400),`hand_on_garment=mask-supported; non-ironing-hand displacement=${handDisplacement.toFixed(1)} px; iron displacement=${toolDisplacement.toFixed(1)} px; visible stabilization candidate only.`,"model_estimated");
    if (handDisplacement>18 && toolDisplacement>=18) add("tension",pairedTimes[0],Math.min(pairedTimes.at(-1)!,pairedTimes[0]+2),.48,`two-hand garment interaction; directional hand displacement=${handDisplacement.toFixed(1)} px while tool moves; visible tension candidate, not force.`,"model_estimated");
  }
  input.slips.forEach((slip)=>add("slip",slip.start_time_sec,slip.end_time_sec,slip.candidate_score,slip.evidence,"auto_tracked"));
  if (lastActivity !== undefined && input.duration-lastActivity>.4) add("release",lastActivity,Math.min(input.duration,lastActivity+1),.55,`last visible hand/tool activity=${lastActivity.toFixed(3)} sec followed by disengagement toward episode end.`,"model_estimated");
  if (!tools.length && handTimes.length>=2 && input.garmentMaskAvailable) add("inspect_candidate",handTimes.at(-2)!,handTimes.at(-1)!,.35,`manipulation pause; no usable iron track; garment remains visible. Human intent is not inferred.`,"model_estimated");
  const sorted=proposed.sort((a,b)=>a.start_time_sec-b.start_time_sec); const merged: typeof proposed=[];
  for(const candidate of sorted){const previous=[...merged].reverse().find((item)=>item.proposed_label===candidate.proposed_label);if(previous&&candidate.start_time_sec-previous.end_time_sec<=.35){previous.end_time_sec=Math.max(previous.end_time_sec,candidate.end_time_sec);previous.end_frame=Math.max(previous.end_frame,candidate.end_frame);previous.duration_sec=round(previous.end_time_sec-previous.start_time_sec);previous.candidate_score=previous.candidate_score===null?candidate.candidate_score:candidate.candidate_score===null?previous.candidate_score:round((previous.candidate_score+candidate.candidate_score)/2);previous.evidence=`${previous.evidence} Merged with continuous same-label evidence through ${candidate.end_time_sec.toFixed(3)} sec.`;}else merged.push({...candidate});}
  return merged.sort((a,b)=>a.start_time_sec-b.start_time_sec).map((candidate,index)=>({ ...candidate, candidate_id:`TC_${String(index+1).padStart(3,"0")}` }));
}
