import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany
} from "typeorm";
import { Club } from "./Club";
import { Ticket } from "./Ticket";

@Entity()
export class Event {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // Relation to the club that owns this event
  @ManyToOne(() => Club, (club) => club.events, { onDelete: "CASCADE" })
  club!: Club;

  @Column()
  clubId!: string;

  @Column()
  name!: string;

  @Column("text", { nullable: true })
  description?: string;

  @Column({ nullable: true })
  bannerUrl?: string;
  
  @Column()
  BannerURLBlurHash!: string;

  // Required event date (single day only)
  @Column({ type: "date" })
  availableDate!: Date;

  @Column('jsonb', { nullable: true })
  openHours?: { open: string, close: string };

  @Column({ default: true })
  isActive!: boolean;

  @Column({ default: false })
  isDeleted!: boolean;

  @Column({ type: "timestamp", nullable: true })
  deletedAt?: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
  
  @OneToMany(() => Ticket, (ticket) => ticket.event)
  tickets!: Ticket[];

}
