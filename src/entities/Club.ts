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

  @Column()
  location!: string;

  @Column()
  musicType!: string;

  @Column({ nullable: true })
  instagram?: string;

  @Column({ nullable: true })
  whatsapp?: string;

  @Column()
  openHours!: string;

  @Column("simple-array")
  openDays!: string[]; // e.g., ["Friday", "Saturday"]

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
}
