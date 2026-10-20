import { Router, type IRouter } from "express";
import championPosterRouter from "./champion-poster";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(championPosterRouter);

export default router;
