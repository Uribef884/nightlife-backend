import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Club } from "../entities/Club";
import { ManyToOne } from "typeorm"; 

export function createClub(req: Request, res: Response): void {
  const repo = AppDataSource.getRepository(Club);
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
  } = req.body;

  if (!name || !description || !address || !location || !musicType || !openHours || !openDays || !profileImageUrl || !profileImageBlurhash) {
    res.status(400).json({ error: "Missing required fields" });
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
  });

  repo
    .save(club)
    .then((saved) => res.status(201).json(saved))
    .catch((err) => {
      console.error("Error saving club:", err);
      res.status(500).json({ error: "Internal server error" });
    });
}

// UPDATE CLUB
export async function updateClub(req: Request, res: Response): Promise<void> {
  try {
    const repo = AppDataSource.getRepository(Club);
    const { id } = req.params;
    const updates = req.body;

    const club = await repo.findOneBy({ id });
    if (!club) {
      res.status(404).json({ error: "Club not found" });
      return;
    }

    repo.merge(club, updates);
    const updated = await repo.save(club);
    res.json(updated);
  } catch (error) {
    console.error("❌ Error updating club:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

// DELETE CLUB
export async function deleteClub(req: Request, res: Response): Promise<void> {
  try {
    const repo = AppDataSource.getRepository(Club);
    const { id } = req.params;

    const club = await repo.findOneBy({ id });
    if (!club) {
      res.status(404).json({ error: "Club not found" });
      return;
    }

    await repo.remove(club);
    res.status(204).send(); // No Content
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