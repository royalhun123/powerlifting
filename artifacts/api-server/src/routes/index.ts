import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import trainingRouter from "./training";
import privateAccessRouter from "./private-access";
import passwordAccessRouter from "./password-access";
import coachesRouter from "./coaches";
import { privateLoginEnabled } from "../lib/private-access";

const router: IRouter = Router();

router.use(healthRouter);
router.use(passwordAccessRouter);
router.use(coachesRouter);
router.use(privateAccessRouter);
router.use((req,res,next)=>{
  if(!privateLoginEnabled()) {next();return;}
  if(req.path==="/auth/user") {res.json({user:req.user??null});return;}
  if(["/callback","/mobile-auth/token-exchange","/mobile-auth/authorize"].includes(req.path)) {res.status(410).json({error:"Use your private sign-in link."});return;}
  next();
});
router.use((req,res,next)=>privateLoginEnabled() ? next() : authRouter(req,res,next));
router.use(trainingRouter);

export default router;
