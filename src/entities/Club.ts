import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
} from "typeorm";
import { Ticket } from "./Ticket";
import { User } from "./User";
import { Event } from "./Event"; 

@Entity()
export class Club {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  name!: string;

  @Column()
  description!: string;

  @Column()
  address!: string;

  @Column({ default: "https://maps.google.com" })
  googleMaps!: string; 

  @Column({ default: "Medellín" })
  city!: string;
 
  @Column("text", { array: true })
  musicType!: string[]; 

  @Column("text", { array: true })
  openDays!: string[]; 

  @Column("float", { nullable: true })
  latitude?: number;

  @Column("float", { nullable: true })
  longitude?: number;

  @Column({ nullable: true })
  instagram?: string;

  @Column({ nullable: true })
  whatsapp?: string;

  @Column()
  openHours!: string;

  @Column({ nullable: true })
  dressCode?: string;

  @Column({ nullable: true })
  minimumAge?: number;

  @Column({ nullable: true })
  extraInfo?: string;

  @Column({ default: 999 })
  priority!: number;

  @Column()
  profileImageUrl!: string;

  @Column()
  profileImageBlurhash!: string;

  @ManyToOne(() => User)
  owner!: User;

  @Column()
  ownerId!: string;

  @OneToMany(() => Ticket, (ticket) => ticket.club)
  tickets!: Ticket[];

  @OneToMany(() => User, (user) => user.club)
  bouncers!: User[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => Event, (event) => event.club)
  events!: Event[];
}