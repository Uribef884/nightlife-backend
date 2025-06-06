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

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
  
  @OneToMany(() => Ticket, (ticket) => ticket.event)
  tickets!: Ticket[];

}
