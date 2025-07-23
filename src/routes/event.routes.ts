import { Router } from "express";
import {
  getAllEvents,
  getEventsByClubId,
  getMyClubEvents,
  createEvent,
  updateEvent,
  updateEventImage,
  toggleEventVisibility,
  deleteEvent,
} from "../controllers/event.controller";
import { authMiddleware } from "../middlewares/authMiddleware";
import { upload } from "../middlewares/uploadMiddleware";

const router = Router();

// 📣 Public routes
router.get("/", getAllEvents);                    // GET /events
router.get("/club/:clubId", getEventsByClubId);   // GET /events/club/:clubId

// 🔐 Club Owner routes
router.get("/my-club", authMiddleware, getMyClubEvents); // GET /events/my-club
router.post("/", authMiddleware, upload.single('image'), createEvent);   // POST /events
router.put("/:id", authMiddleware, updateEvent);   // PUT /events/:id
router.put("/:id/image", authMiddleware, upload.single('image'), updateEventImage);   // PUT /events/:id/image
router.patch("/:id/toggle-visibility", authMiddleware, toggleEventVisibility);   // PATCH /events/:id/toggle-visibility
router.delete("/:id", authMiddleware, deleteEvent); // DELETE /events/:id

export default router;
