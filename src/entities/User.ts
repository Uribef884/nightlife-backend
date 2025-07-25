import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Club } from "./Club";

export type UserRole = "user" | "clubowner" | "waiter" | "bouncer" | "admin";

@Entity()
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column({ nullable: true })
  password?: string;

  @Column({
    type: "varchar",
    default: "user",
  })
  role!: UserRole;

  // OAuth fields
  @Column({ nullable: true })
  googleId?: string;

  @Column({ nullable: true })
  firstName?: string;

  @Column({ nullable: true })
  lastName?: string;

  @Column({ nullable: true })
  avatar?: string;

  @Column({ default: false })
  isOAuthUser!: boolean;

  @ManyToOne(() => Club, { onDelete: "SET NULL" })
  @JoinColumn({ name: "clubId" })
  club?: Club;

  @Column({ nullable: true })
  clubId?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
