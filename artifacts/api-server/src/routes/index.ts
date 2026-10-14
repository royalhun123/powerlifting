import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import trainingRouter from "./training";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(trainingRouter);

export default router;
