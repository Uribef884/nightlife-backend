import { Router } from "express";
import { register, login, deleteUser, deleteOwnUser, updateUserRole, logout } from "../controllers/auth.controller";
import { isAdmin } from "../middlewares/isAdmin";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);
router.delete("/me", requireAuth, deleteOwnUser);
router.delete("/:id", requireAuth, isAdmin, deleteUser);
router.patch("/:id/role", requireAuth, isAdmin, updateUserRole);


export default router;
