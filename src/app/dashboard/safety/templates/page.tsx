
"use client";

import React, { useState, useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { useAppState, useAuth } from "@/modules/core/contexts/app-provider";
import { PanelCard } from "@/components/ui/panel-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/modules/core/hooks/use-toast";
import { Loader2, PlusCircle, Trash2, FileUp, ListChecks, ClipboardCheck } from "lucide-react";
import { ChecklistTemplate } from "@/modules/core/lib/data";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";


export default function AprTemplatesPage() {
  const { users, checklistTemplates, addChecklistTemplate, assignChecklistToSupervisors, deleteChecklistTemplate, can } = useAppState();
  const { user: authUser } = useAuth();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  // `uid` is a stable local key for React (not persisted) — avoids key={index}
  // glitches when items are added/removed mid-list.
  const [items, setItems] = useState<{ element: string; uid: string }[]>([{ element: "", uid: crypto.randomUUID() }]);
  const [assigningTemplate, setAssigningTemplate] = useState<ChecklistTemplate | null>(null);
  const [selectedSupervisorIds, setSelectedSupervisorIds] = useState<string[]>([]);
  const [workArea, setWorkArea] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);

  const assignableUsers = useMemo(() => {
    const rolesToAssign = ['supervisor', 'apr', 'admin', 'operations'];
    if (!users) return [];
    return users.filter(u => rolesToAssign.includes(u.role));
  }, [users]);
  
  const canManageTemplates = can('safety_templates:create');

  const handleItemChange = (index: number, value: string) => {
    setItems(items.map((it, i) => (i === index ? { ...it, element: value } : it)));
  };

  const handleAddItem = () => {
    setItems([...items, { element: "", uid: crypto.randomUUID() }]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length > 1) {
      const newItems = items.filter((_, i) => i !== index);
      setItems(newItems);
    }
  };

  const handleSaveTemplate = async () => {
    if (!title.trim() || items.some(item => !item.element.trim())) {
        toast({ variant: 'destructive', title: 'Error', description: 'Por favor, completa el título y todos los ítems antes de guardar.' });
        return;
    }
    
    setIsSubmitting(true);
    try {
        await addChecklistTemplate({ title, items: items.map(({ element }) => ({ element })) });
        toast({ title: 'Plantilla Guardada', description: `La plantilla "${title}" ha sido creada.` });
        setTitle('');
        setItems([{ element: '', uid: crypto.randomUUID() }]);
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message || 'No se pudo guardar la plantilla.' });
    } finally {
        setIsSubmitting(false);
    }
  };
  
  const handleAssign = async () => {
      if (!assigningTemplate || selectedSupervisorIds.length === 0 || !workArea.trim()) {
          toast({ variant: 'destructive', title: 'Error', description: 'Selecciona una plantilla, al menos un usuario y especifica la obra.' });
          return;
      }
      setIsAssigning(true);
      try {
        await assignChecklistToSupervisors(assigningTemplate, selectedSupervisorIds, workArea);
        toast({ title: 'Asignación Completa', description: `La plantilla "${assigningTemplate.title}" ha sido asignada a ${selectedSupervisorIds.length} usuario(s) para la obra ${workArea}.` });
        setAssigningTemplate(null);
        setSelectedSupervisorIds([]);
        setWorkArea("");
      } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error de Asignación', description: error.message || 'No se pudo completar la asignación.' });
      } finally {
        setIsAssigning(false);
      }
  }

  const handleDeleteTemplate = async (templateId: string) => {
    try {
        await deleteChecklistTemplate(templateId);
        toast({ title: "Plantilla Eliminada", description: "La plantilla ha sido eliminada correctamente."});
    } catch(error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message || 'No se pudo eliminar la plantilla.' });
    }
  }


  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Gestión de Plantillas de Checklist"
        description="Crea, visualiza y asigna plantillas de checklist a los supervisores."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {canManageTemplates && (
            <PanelCard
              title="Crear Nueva Plantilla"
              description="Define los ítems que contendrá el checklist. Estos serán los puntos que los supervisores deberán verificar."
              icon={ClipboardCheck}
              contentClassName="space-y-6"
            >
                <div className="space-y-2">
                    <Label htmlFor="template-title">Título de la Plantilla</Label>
                    <Input 
                        id="template-title" 
                        placeholder="Ej: Inspección Semanal de Andamios"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                    />
                </div>

                <div className="space-y-4">
                    <Label>Ítems del Checklist</Label>
                    <ScrollArea className="h-60 border rounded-md p-4">
                        {items.map((item, index) => (
                        <div key={item.uid} className="flex items-center gap-2 mb-2">
                            <Input
                            placeholder={`Ítem de verificación #${index + 1}`}
                            value={item.element}
                            onChange={(e) => handleItemChange(index, e.target.value)}
                            />
                            <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveItem(index)}
                            disabled={items.length <= 1}
                            className="text-destructive"
                            >
                            <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                        ))}
                    </ScrollArea>
                    <Button variant="outline" onClick={handleAddItem} className="w-full">
                        <PlusCircle className="mr-2 h-4 w-4" /> Añadir Ítem
                    </Button>
                </div>
                
                <Button onClick={handleSaveTemplate} disabled={isSubmitting || !title.trim()} className="w-full">
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <PlusCircle className="mr-2 h-4 w-4" />}
                    Guardar Plantilla
                </Button>
            </PanelCard>
        )}
        
        <PanelCard
              title="Plantillas y Asignación"
              description="Visualiza las plantillas guardadas y asígnalas a los supervisores para que las completen."
              icon={ClipboardCheck}
            >
                 {(!checklistTemplates || checklistTemplates.length === 0) ? (
                    <div className="text-center text-muted-foreground p-8 border-2 border-dashed rounded-lg">
                        <p>Aún no has creado ninguna plantilla.</p>
                        {canManageTemplates && <p className="text-sm">Usa el formulario de la izquierda para empezar.</p>}
                    </div>
                 ) : (
                    <ScrollArea className="h-[calc(80vh-12rem)]">
                        <div className="space-y-4 pr-4">
                            {checklistTemplates.map(template => (
                                <div key={template.id} className="p-4 border rounded-lg flex justify-between items-center">
                                    <h4 className="font-semibold">{template.title || 'Plantilla sin título'}</h4>
                                    <div className="flex items-center gap-2">
                                        {authUser?.role === 'admin' && (
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="text-destructive h-8 w-8">
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>¿Eliminar plantilla "{template.title}"?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Esta acción no se puede deshacer. Se eliminará permanentemente la plantilla. No afectará a los checklists que ya hayan sido asignados.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleDeleteTemplate(template.id)} className="bg-destructive hover:bg-destructive/90">
                                                            Sí, eliminar
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        )}
                                        {canManageTemplates && <Button onClick={() => setAssigningTemplate(template)}>Asignar</Button>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                 )}
            </PanelCard>

      </div>
      
       <AlertDialog open={!!assigningTemplate} onOpenChange={(isOpen) => { if (!isOpen) { setAssigningTemplate(null); setWorkArea(""); setSelectedSupervisorIds([]); } }}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Asignar Plantilla "{assigningTemplate?.title}"</AlertDialogTitle>
                    <AlertDialogDescription>
                        Selecciona los usuarios que deben completar este checklist y especifica la obra o área.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-4 space-y-4">
                   <div className="space-y-2">
                       <Label htmlFor="work-area">Obra / Área de Trabajo</Label>
                       <Input 
                            id="work-area" 
                            placeholder="Ej: Obra File 721, Bodega Central"
                            value={workArea}
                            onChange={(e) => setWorkArea(e.target.value)}
                        />
                   </div>
                   <Label>Usuarios Asignables</Label>
                   <ScrollArea className="h-40 border rounded-md">
                       <div className="p-4 space-y-2">
                            {assignableUsers.map(sup => (
                               <div key={sup.id} className="flex items-center space-x-2">
                                 <Checkbox 
                                    id={`sup-${sup.id}`}
                                    checked={selectedSupervisorIds.includes(sup.id)}
                                    onCheckedChange={(checked) => {
                                        setSelectedSupervisorIds(prev => 
                                            checked
                                                ? [...prev, sup.id]
                                                : prev.filter(id => id !== sup.id)
                                        );
                                    }}
                                 />
                                 <Label htmlFor={`sup-${sup.id}`}>{sup.name} <span className="text-xs text-muted-foreground">({sup.role})</span></Label>
                               </div>
                            ))}
                       </div>
                   </ScrollArea>
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleAssign} disabled={isAssigning || !workArea.trim() || selectedSupervisorIds.length === 0}>
                        {isAssigning ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                        Asignar
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

    </div>
  );
}
