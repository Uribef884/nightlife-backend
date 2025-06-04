import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Club } from "../entities/Club";
import { User } from "../entities/User";
import { AuthenticatedRequest } from "../types/express"; 

// CREATE CLUB
export async function createClub(req: AuthenticatedRequest, res: Response): Promise<void> {
  const repo = AppDataSource.getRepository(Club);
  const userRepo = AppDataSource.getRepository(User);

  const {
    name,
    description,
    address,
    city,
    googleMaps,
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
    latitude,
    longitude,
    ownerId,
  } = req.body;

  const admin = req.user;
  if (!admin || admin.role !== "admin") {
    res.status(403).json({ error: "Forbidden: Only admins can create clubs" });
    return;
  }

  if (!ownerId || typeof ownerId !== "string" || ownerId.trim() === "") {
    res.status(400).json({ error: "Missing or invalid required field: ownerId" });
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
    city,
    googleMaps,
    musicType,
    instagram,
    whatsapp,
    openHours,
    openDays,
    dressCode,
    minimumAge,
    extraInfo,
    priority: priority && priority >= 1 ? priority : 1,
    profileImageUrl,
    profileImageBlurhash,
    latitude,
    longitude,
    owner,
    ownerId: owner.id,
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

    if (user?.role === "clubowner" && club.ownerId !== user.id) {
      res.status(403).json({ error: "You do not own this club" });
      return;
    }

    const { ownerId, priority, ...allowedUpdates } = req.body;

    if (priority && priority < 1) {
      allowedUpdates.priority = 1;
    } else if (priority) {
      allowedUpdates.priority = priority;
    }

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

    const isAdmin = user?.role === "admin";
    const isOwner = user?.role === "clubowner" && club.ownerId === user.id;

    if (!isAdmin && !isOwner) {
      res.status(403).json({ error: "You are not authorized to delete this club" });
      return;
    }

    await repo.remove(club);
    res.status(200).json({ message: "Club deleted successfully" }); // 👈 changed from 204
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

    const publicClubs = clubs.map(club => ({
      id: club.id,
      name: club.name,
      description: club.description,
      address: club.address,
      googleMaps: club.googleMaps,
      latitude: club.latitude,
      longitude: club.longitude,
      musicType: club.musicType,
      instagram: club.instagram,
      whatsapp: club.whatsapp,
      openHours: club.openHours,
      openDays: club.openDays,
      dressCode: club.dressCode,
      minimumAge: club.minimumAge,
      extraInfo: club.extraInfo,
      profileImageUrl: club.profileImageUrl,
      profileImageBlurhash: club.profileImageBlurhash,
      priority: club.priority,
    }));

    res.json(publicClubs);
  } catch (error) {
    console.error("❌ Error fetching clubs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function getClubById(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const user = req.user;
    const repo = AppDataSource.getRepository(Club);

    const club = await repo.findOne({ where: { id }, relations: ["owner"] });

    if (!club) {
      res.status(404).json({ error: "Club not found" });
      return;
    }

    const isAdmin = user?.role === "admin";
    const isOwner = user?.role === "clubowner" && user.id === club.ownerId;
    const isBouncer = user?.role === "bouncer";

    if (isAdmin || isOwner) {
      res.status(200).json(club); // return full object
    } else {
      // return public view
      const publicFields = {
        id: club.id,
        name: club.name,
        description: club.description,
        address: club.address,
        city: club.city,
        googleMaps: club.googleMaps,
        latitude: club.latitude,
        longitude: club.longitude,
        musicType: club.musicType,
        instagram: club.instagram,
        whatsapp: club.whatsapp,
        openHours: club.openHours,
        openDays: club.openDays,
        dressCode: club.dressCode,
        minimumAge: club.minimumAge,
        extraInfo: club.extraInfo,
        profileImageUrl: club.profileImageUrl,
        profileImageBlurhash: club.profileImageBlurhash,
        priority: club.priority,
      };
      res.status(200).json(publicFields);
    }
  } catch (error) {
    console.error("❌ Error fetching club:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

const ALLOWED_MUSIC_TYPES = ["Electronic", "Techno", "Reggaeton", "Crossover", "Salsa", "Pop"];
const ALLOWED_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function coerceToStringArray(input: any): string[] {
  if (Array.isArray(input)) {
    return input.map(String).map(s => s.trim()).filter(Boolean);
  }
  if (typeof input === "string") {
    return input.split(",").map(s => s.trim()).filter(Boolean);
  }
  return [];
}

export async function getFilteredClubs(req: Request, res: Response): Promise<void> {
  try {
    const repo = AppDataSource.getRepository(Club);
    const queryBuilder = repo.createQueryBuilder("club");

    const { query, city, musicType, openDays } = req.query;

      // Sanitize and apply full-text query
    if (query && typeof query === "string" && query.length < 100) {
      const trimmed = query.trim().toLowerCase();

      queryBuilder.andWhere(
        `(LOWER(club.name) ILIKE :q
          OR LOWER(club.description) ILIKE :q
          OR LOWER(club.address) ILIKE :q
          OR EXISTS (
            SELECT 1 FROM unnest(club.musicType) AS mt
            WHERE LOWER(mt) ILIKE :q
          )
        )`,
        { q: `%${trimmed}%` }
      );
    }

    // Sanitize and filter city
    if (typeof city === "string" && city.trim().length > 0) {
      queryBuilder.andWhere("club.city = :city", { city: city.trim() });
    }

    // Music type filter
    const musicArray = coerceToStringArray(musicType);
    const validMusic = musicArray.filter(type => ALLOWED_MUSIC_TYPES.includes(type));
    if (validMusic.length > 0) {
      queryBuilder.andWhere("club.musicType && :musicType", { musicType: validMusic });
    }

    // Open days filter
    const daysArray = coerceToStringArray(openDays);
    const validDays = daysArray.filter(day => ALLOWED_DAYS.includes(day));
    if (validDays.length > 0) {
      queryBuilder.andWhere("club.openDays && :openDays", { openDays: validDays });
    }

    queryBuilder.orderBy("club.priority", "ASC");

    const clubs = await queryBuilder.getMany();

    const publicClubs = clubs.map(club => ({
      id: club.id,
      name: club.name,
      description: club.description,
      address: club.address,
      googleMaps: club.googleMaps,
      latitude: club.latitude,
      longitude: club.longitude,
      city: club.city,
      musicType: club.musicType,
      instagram: club.instagram,
      whatsapp: club.whatsapp,
      openHours: club.openHours,
      openDays: club.openDays,
      dressCode: club.dressCode,
      minimumAge: club.minimumAge,
      extraInfo: club.extraInfo,
      profileImageUrl: club.profileImageUrl,
      profileImageBlurhash: club.profileImageBlurhash,
      priority: club.priority,
    }));

    res.json(publicClubs);
  } catch (error) {
    console.error("❌ Error filtering clubs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}