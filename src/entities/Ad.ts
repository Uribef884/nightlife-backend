import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn
} from "typeorm";
import { Club } from "./Club";

export type AdTargetType = "event" | "ticket";

@Entity()
export class Ad {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ nullable: true })
  clubId?: string; // null for admin ads

  @ManyToOne(() => Club, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "clubId" })
  club?: Club;

  @Column()
  imageUrl!: string;

  @Column()
  imageBlurhash!: string;

  @Column({ default: 1 })
  priority!: number;

  @Column({ default: true })
  isVisible!: boolean;

  @Column({ type: "varchar", nullable: true })
  targetType?: AdTargetType | null; // "event" | "ticket" | null

  @Column({ type: "varchar", nullable: true })
  targetId?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ default: true })
  isActive!: boolean;

  @Column({ default: false })
  isDeleted!: boolean;

  @Column({ type: "timestamp", nullable: true })
  deletedAt?: Date;
} 