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

export type UserRole = "user" | "clubowner" | "bouncer" | "admin";

@Entity()
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  password!: string;

  @Column({
    type: "varchar",
    default: "user",
  })
  role!: UserRole;

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
