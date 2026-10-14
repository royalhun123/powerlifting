import type { Workspace, Program, Session } from "./training-types";
import { sessionVolume, today } from "./training-types";

// Synthetic, explicitly labeled visitor data. Never reads actual athlete records.
export function demoWorkspace(): Workspace {
  const now = new Date();
  const shift = (days: number) => { const d=new Date(now); d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10); };
  const program: Program = {
    id:"demo-peak",name:"Meet Peak",description:"A four-week competition peak. Example program — log in to access your own training workspace.",phase:"peak",weeks:4,archived:false,source:"Demo program",reviewCount:0,
    workouts: Array.from({length:4},(_,week) => [
      {id:`w${week+1}-d1`,week:week+1,day:1,name:"Primary squat + tertiary bench",exercises:[
        {id:"squat",name:"Competition squat",sets:"3",reps:"1",effort:`${85+week*2.5}%`,weight:"",notes:"Controlled walkout. Competition depth.",review:false,lift:"squat" as const},
        {id:"backoff",name:"Squat backdowns",sets:"2",reps:"2",effort:"75%",weight:"",notes:"Keep every rep consistent.",review:false,lift:"accessory" as const},
        {id:"bench",name:"Technique bench",sets:"3",reps:"3",effort:"RPE 6",weight:"",notes:"Pause on the chest.",review:false,lift:"accessory" as const},
        {id:"pullup",name:"Weighted pull-ups",sets:"3",reps:"5–8",effort:"RPE 8",weight:"",notes:"Log external load only.",review:false,lift:"accessory" as const},
      ]},
      {id:`w${week+1}-d2`,week:week+1,day:2,name:"Primary bench + secondary deadlift",exercises:[
        {id:"bench",name:"Competition bench",sets:"3",reps:"1",effort:"85%",weight:"",notes:"Full pause.",review:false,lift:"bench" as const},
        {id:"dead",name:"Paused deadlift",sets:"3",reps:"3",effort:"RPE 6",weight:"",notes:"Pause below the knee.",review:false,lift:"accessory" as const},
      ]},
      {id:`w${week+1}-d3`,week:week+1,day:4,name:"Primary deadlift",exercises:[
        {id:"dead",name:"Competition deadlift",sets:"3",reps:"1",effort:"85%",weight:"",notes:"Take the slack out.",review:false,lift:"deadlift" as const},
      ]},
    ]).flat().map(workout => ({
      ...workout,
      exercises: workout.exercises.map(ex => ({
        ...ex,
        sourceUnit: "lb" as const,
        setWeights: ex.id === "squat" ? [325, 335, 330] : [],
      })),
    }))
  };
  const sessions: Session[] = Array.from({length:12},(_,i) => {
    const lift = (["squat","bench","deadlift"] as const)[i%3]!;
    const weight = ({squat:295,bench:185,deadlift:365}[lift]) + Math.floor(i/3)*10;
    const sets: Session["sets"] = Array.from({length:5},(_,j) => ({exerciseId:lift,exerciseName:`Competition ${lift}`,lift,setNumber:j+1,weight:j===0?weight:weight-35,reps:j===0?3:5,rpe:j===0?8:7,completed:true,notes:""}));
    const s:Session = {id:`demo-session-${i}`,assignmentId:"demo-assignment",workoutId:`w${Math.floor(i/3)+1}-d${i%3+1}`,name:`${lift[0]!.toUpperCase()+lift.slice(1)} session`,date:shift(-28+i*2),unit:"lb",status:"completed",notes:i===11?"Strong lockout. Ready for the next week.":"All working sets completed.",sets,athleteId:"demo",athleteName:"Alex Morgan",coachFeedback:"",volume:0,updatedAt:now.toISOString()};
    // Earlier sample history belongs to the preceding block, not this assignment.
    if (i < 9) s.assignmentId = "demo-previous-block";
    else s.workoutId = `w1-d${i%3+1}`;
    s.volume=sessionVolume(s);return s;
  });
  return {demo:true,profile:{id:"demo",name:"Alex Morgan",unit:"lb",meetDate:shift(30),squatMax:385,benchMax:225,deadliftMax:465,coachName:""},programs:[program],athletes:[],assignments:[{id:"demo-assignment",athleteId:"demo",athleteName:"Alex Morgan",program,startDate:today(),coachName:"Self-coached"}],sessions:sessions.reverse(),invitations:[]};
}
