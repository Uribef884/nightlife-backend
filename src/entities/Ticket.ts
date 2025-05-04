import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
  } from "typeorm";
  import { Club } from "./Club";
  
  @Entity()
  export class Ticket {
    @PrimaryGeneratedColumn("uuid")
    id!: string;
  
    @Column()
    name!: string;
  
    @Column("text", { nullable: true })
    description?: string;
  
    @Column("decimal")
    price!: number;
  
    @Column("int")
    maxPerPerson!: number;
  
    @Column("int")
    priority!: number;
  
    @Column({ default: true })
    isActive!: boolean;
  
    @Column("date", { array: true, nullable: true })
    availableDates?: string[]; // Optional — only for special events
  
    @CreateDateColumn()
    createdAt!: Date;
  
    @UpdateDateColumn()
    updatedAt!: Date;
  
    @ManyToOne(() => Club, (club) => club.tickets)
    club!: Club;
  }
  