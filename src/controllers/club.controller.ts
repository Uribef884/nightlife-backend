import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Club } from "../entities/Club";
import { User } from "../entities/User";
import { AuthenticatedRequest } from "../types/express"; 

export async function createClub(req: AuthenticatedRequest, res: Response): Promise<void> {
  const repo = AppDataSource.getRepository(Club);
  const userRepo = AppDataSource.getRepository(User);

  const {
    name,
    description,
    address,
    location,
    musicType,
    instagram,
    whatsapp,
    openHours,
    openDays,
    dressCode,
    minimumAge,
    extraInfo,
    priority,
    profileImageUrl,
    profileImageBlurhash,
    ownerId
  } = req.body;

  const admin = req.user;

  if (!admin || admin.role !== "admin") {
    res.status(403).json({ error: "Forbidden: Only admins can create clubs" });
    return;
  }

  if (!ownerId) {
    res.status(400).json({ error: "Missing required field: ownerId" });
    return;
  }

  const owner = await userRepo.findOneBy({ id: ownerId });
  if (!owner) {
    res.status(404).json({ error: "User with provided ownerId not found" });
    return;
  }

  const club = repo.create({
    name,
    description,
    address,
    location,
    musicType,
    instagram,
    whatsapp,
    openHours,
    openDays,
    dressCode,
    minimumAge,
    extraInfo,
    priority: Math.max(1, priority || 999),
    profileImageUrl,
    profileImageBlurhash,
    owner,
    ownerId: owner.id
  });

  await repo.save(club);

  if (owner.role === "user") {
    owner.role = "clubowner";
    await userRepo.save(owner);
  }

  res.status(201).json(club);
}

// UPDATE CLUB
export async function updateClub(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const repo = AppDataSource.getRepository(Club);
    const { id } = req.params;
    const user = req.user;

    const club = await repo.findOne({ where: { id }, relations: ["owner"] });

    if (!club) {
      res.status(404).json({ error: "Club not found" });
      return;
    }

    // 🔒 Prevent clubowners from updating clubs they don't own
    if (user?.role === "clubowner" && club.ownerId !== user.id) {
      res.status(403).json({ error: "You do not own this club" });
      return;
    }

    // ✅ Remove forbidden fields (e.g., ownerId)
    const { ownerId, ...allowedUpdates } = req.body;

    repo.merge(club, allowedUpdates);
    const updated = await repo.save(club);
    res.json(updated);
  } catch (error) {
    console.error("❌ Error updating club:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

// DELETE CLUB
export async function deleteClub(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const repo = AppDataSource.getRepository(Club);
    const { id } = req.params;
    const user = req.user;

    const club = await repo.findOne({
      where: { id },
      relations: ["owner"]
    });

    if (!club) {
      res.status(404).json({ error: "Club not found" });
      return;
    }

    // ✅ Allow admins to delete any club
    // ✅ Allow clubowners to delete only their own clubs
    const isAdmin = user?.role === "admin";
    const isOwner = user?.role === "clubowner" && club.ownerId === user.id;

    if (!isAdmin && !isOwner) {
      res.status(403).json({ error: "You are not authorized to delete this club" });
      return;
    }

    await repo.remove(club);
    res.status(204).send();
  } catch (error) {
    console.error("❌ Error deleting club:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function getAllClubs(req: Request, res: Response): Promise<void> {
  try {
    const repo = AppDataSource.getRepository(Club);
    const clubs = await repo.find({
      order: { priority: "ASC" }
    });
    res.json(clubs);
  } catch (error) {
    console.error("❌ Error fetching clubs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function getClubById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const clubRepo = AppDataSource.getRepository(Club);
    const club = await clubRepo.findOneBy({ id });

    if (!club) {
      res.status(404).json({ error: "Club not found" });
      return;
    }

    res.status(200).json(club);
  } catch (error) {
    console.error("❌ Error fetching club:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}