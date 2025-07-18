import { Router } from "express";
import {
  getAllEvents,
  getEventsByClubId,
  getMyClubEvents,
  createEvent,
  deleteEvent,
} from "../controllers/event.controller";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

// 📣 Public routes
router.get("/", getAllEvents);                    // GET /events
router.get("/club/:clubId", getEventsByClubId);   // GET /events/club/:clubId

// 🔐 Club Owner routes
router.get("/my-club", authMiddleware, getMyClubEvents); // GET /events/my-club
router.post("/", authMiddleware, createEvent);   // POST /events
router.delete("/:id", authMiddleware, deleteEvent); // DELETE /events/:id

export default router;
